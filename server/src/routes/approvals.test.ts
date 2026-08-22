import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { closeDb, getDb } from "../db/connection";
import { runMigrations, runSeedIfEmpty } from "../db/migrate";
import { signAccessToken } from "../services/jwt";

/**
 * Approval API integration tests (work order 06, 二级 seam).
 *
 * Exercises the full approve / reject / return / transfer flow against the
 * seeded "IT设备申领表" template (chain: 直属上级 张三 → 系统管理员 admin). A
 * submitter (李四, whose manager is 张三) submits, then the approvers act.
 * Every write is gated on an Idempotency-Key (ADR-0002) and an instanceVersion
 * optimistic lock (ADR-0003). Key seams: node advancement, reject/return
 * termination, return → resubmit chain restart, transfer reassignment, and the
 * duplicate-key / version-race 409s.
 */

const app = createApp();

const COOKIE = "access_token";
function authCookie(userId: string): string {
  return COOKIE + "=" + signAccessToken(userId);
}

let adminId: string;
let zhangsanId: string;
let lisiId: string;
let publishedTemplateId: string;

const createdInstanceIds: string[] = [];

const validValues = {
  "fld-001": "李四",
  "fld-002": "laptop",
  "fld-003": 1,
  "fld-004": "需要一台笔记本电脑用于日常开发工作",
  "fld-005": "normal",
};

function recordByOrder(
  submit: request.Response,
  order: number,
): { id: string; node_order: number; approver_id: string } {
  return submit.body.approval_records.find((r: { node_order: number }) => r.node_order === order);
}

/** Create a fresh instance as lisi and submit it. Returns the submit response. */
async function createAndSubmit(submitterId = lisiId) {
  const created = await request(app)
    .post("/api/v1/instances")
    .set("Cookie", authCookie(submitterId))
    .send({ template_id: publishedTemplateId });
  expect(created.status).toBe(201);
  const instanceId = created.body.id;
  createdInstanceIds.push(instanceId);

  const submit = await request(app)
    .post(`/api/v1/instances/${instanceId}/submit`)
    .set("Cookie", authCookie(submitterId))
    .send({ field_values: validValues });
  expect(submit.status).toBe(200);
  expect(submit.body.approval_records).toHaveLength(2);
  return { instanceId, submit };
}

beforeAll(async () => {
  await runMigrations();
  await runSeedIfEmpty();

  const db = getDb();
  const users = await db("users").select("id", "email");
  const byEmail = (email: string) =>
    users.find((u) => u.email === email)?.id as string;
  adminId = byEmail("admin@example.com");
  zhangsanId = byEmail("zhangsan@example.com");
  lisiId = byEmail("lisi@example.com");

  const tpl = await db("form_templates").where({ name: "IT设备申领表" }).first();
  publishedTemplateId = tpl.id as string;
});

afterAll(async () => {
  const db = getDb();
  for (const id of createdInstanceIds) {
    await db("form_instances").where({ id }).del();
  }
  await closeDb();
});

describe("transfer target options", () => {
  it("lists active users holding approval:approve, excluding the caller", async () => {
    const res = await request(app)
      .get("/api/v1/approvals/options")
      .set("Cookie", authCookie(adminId));
    expect(res.status).toBe(200);
    const ids = res.body.users.map((u: { id: string }) => u.id);
    expect(ids).toContain(zhangsanId);
    expect(ids).not.toContain(adminId); // caller excluded
    expect(ids).not.toContain(lisiId); // filler-only lacks approval:approve
  });

  it("403 for a user without approval:transfer", async () => {
    const res = await request(app)
      .get("/api/v1/approvals/options")
      .set("Cookie", authCookie(lisiId));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});

describe("pending list + read-only detail", () => {
  it("lists each node's pending record for its approver", async () => {
    const { instanceId, submit } = await createAndSubmit();

    const zhangsanPending = await request(app)
      .get("/api/v1/approvals/pending")
      .set("Cookie", authCookie(zhangsanId));
    expect(zhangsanPending.status).toBe(200);
    const zsItem = zhangsanPending.body.items.find(
      (i: { instance: { id: string } }) => i.instance.id === instanceId,
    );
    expect(zsItem).toBeTruthy();
    expect(zsItem.approval.node_order).toBe(1);
    expect(zsItem.template_name).toBe("IT设备申领表");
    expect(zsItem.submitter_name).toBe("李四");

    const adminPending = await request(app)
      .get("/api/v1/approvals/pending")
      .set("Cookie", authCookie(adminId));
    const adminItem = adminPending.body.items.find(
      (i: { instance: { id: string } }) => i.instance.id === instanceId,
    );
    expect(adminItem).toBeTruthy();
    expect(adminItem.approval.node_order).toBe(2);

    // The submitter (李四, filler-only) lacks approval:view_pending — the whole
    // approval area is gated behind the approver permission code.
    const lisiPending = await request(app)
      .get("/api/v1/approvals/pending")
      .set("Cookie", authCookie(lisiId));
    expect(lisiPending.status).toBe(403);
    expect(lisiPending.body.error.code).toBe("FORBIDDEN");
  });

  it("returns the read-only form detail from the frozen snapshot", async () => {
    const { instanceId, submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1);

    const res = await request(app)
      .get(`/api/v1/approvals/${rec1.id}`)
      .set("Cookie", authCookie(zhangsanId));
    expect(res.status).toBe(200);
    expect(res.body.approval.id).toBe(rec1.id);
    expect(res.body.instance.id).toBe(instanceId);
    expect(res.body.instance.template_snapshot.schema).toBeTruthy();
    expect(res.body.instance.approval_records).toHaveLength(2);
  });

  it("403 when the record belongs to another approver", async () => {
    const { submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1); // 张三的节点
    const res = await request(app)
      .get(`/api/v1/approvals/${rec1.id}`)
      .set("Cookie", authCookie(adminId));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});

describe("approve", () => {
  it("advances to in_approval on the first node, then approved on the last", async () => {
    const { submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1);
    const rec2 = recordByOrder(submit, 2);

    const approve1 = await request(app)
      .post(`/api/v1/approvals/${rec1.id}/approve`)
      .set("Cookie", authCookie(zhangsanId))
      .set("Idempotency-Key", `approve1-${submit.body.id}`)
      .send({ instanceVersion: submit.body.version });
    expect(approve1.status).toBe(200);
    expect(approve1.body.approval.action).toBe("approved");
    expect(approve1.body.instance.status).toBe("in_approval");
    expect(approve1.body.instance.current_node_index).toBe(1);

    const approve2 = await request(app)
      .post(`/api/v1/approvals/${rec2.id}/approve`)
      .set("Cookie", authCookie(adminId))
      .set("Idempotency-Key", `approve2-${submit.body.id}`)
      .send({ instanceVersion: approve1.body.instance.version });
    expect(approve2.status).toBe(200);
    expect(approve2.body.instance.status).toBe("approved");
    expect(approve2.body.approval.action).toBe("approved");
  });

  it("409 VERSION_CONFLICT on a stale instanceVersion", async () => {
    const { submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1);
    const res = await request(app)
      .post(`/api/v1/approvals/${rec1.id}/approve`)
      .set("Cookie", authCookie(zhangsanId))
      .set("Idempotency-Key", `stale-${submit.body.id}`)
      .send({ instanceVersion: submit.body.version - 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("VERSION_CONFLICT");
  });

  it("409 APPROVAL_NOT_PENDING once the record was already handled", async () => {
    const { submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1);

    const first = await request(app)
      .post(`/api/v1/approvals/${rec1.id}/approve`)
      .set("Cookie", authCookie(zhangsanId))
      .set("Idempotency-Key", `handled-${submit.body.id}`)
      .send({ instanceVersion: submit.body.version });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/v1/approvals/${rec1.id}/approve`)
      .set("Cookie", authCookie(zhangsanId))
      .set("Idempotency-Key", `handled2-${submit.body.id}`)
      .send({ instanceVersion: first.body.instance.version });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("APPROVAL_NOT_PENDING");
  });

  it("replays a duplicate Idempotency-Key without double-advancing", async () => {
    const { submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1);
    const key = `idem-${submit.body.id}`;

    const first = await request(app)
      .post(`/api/v1/approvals/${rec1.id}/approve`)
      .set("Cookie", authCookie(zhangsanId))
      .set("Idempotency-Key", key)
      .send({ instanceVersion: submit.body.version });
    expect(first.status).toBe(200);

    const dup = await request(app)
      .post(`/api/v1/approvals/${rec1.id}/approve`)
      .set("Cookie", authCookie(zhangsanId))
      .set("Idempotency-Key", key)
      .send({ instanceVersion: submit.body.version });
    expect(dup.status).toBe(200);

    // Exactly one action landed — the record is approved once, the instance
    // advanced once, and the version did not double-bump.
    const detail = await request(app)
      .get(`/api/v1/approvals/${rec1.id}`)
      .set("Cookie", authCookie(zhangsanId));
    expect(detail.body.approval.action).toBe("approved");
    expect(detail.body.instance.status).toBe("in_approval");
    expect(detail.body.instance.version).toBe(first.body.instance.version);
  });

  it("drops the record from pending once handled", async () => {
    const { submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1);
    await request(app)
      .post(`/api/v1/approvals/${rec1.id}/approve`)
      .set("Cookie", authCookie(zhangsanId))
      .set("Idempotency-Key", `clear-${submit.body.id}`)
      .send({ instanceVersion: submit.body.version });

    const pending = await request(app)
      .get("/api/v1/approvals/pending")
      .set("Cookie", authCookie(zhangsanId));
    expect(
      pending.body.items.some((i: { approval: { id: string } }) => i.approval.id === rec1.id),
    ).toBe(false);
  });

  it("400 when the Idempotency-Key header is missing", async () => {
    const { submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1);
    const res = await request(app)
      .post(`/api/v1/approvals/${rec1.id}/approve`)
      .set("Cookie", authCookie(zhangsanId))
      .send({ instanceVersion: submit.body.version });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("403 when the caller lacks approval:approve", async () => {
    const { submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1);
    const res = await request(app)
      .post(`/api/v1/approvals/${rec1.id}/approve`)
      .set("Cookie", authCookie(lisiId))
      .set("Idempotency-Key", `perm-${submit.body.id}`)
      .send({ instanceVersion: submit.body.version });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("403 when the record is assigned to another approver", async () => {
    const { submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1); // 张三的节点，admin 无权处理
    const res = await request(app)
      .post(`/api/v1/approvals/${rec1.id}/approve`)
      .set("Cookie", authCookie(adminId))
      .set("Idempotency-Key", `mismatch-${submit.body.id}`)
      .send({ instanceVersion: submit.body.version });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});

describe("reject", () => {
  it("terminates the instance and stores the comment", async () => {
    const { submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1);
    const res = await request(app)
      .post(`/api/v1/approvals/${rec1.id}/reject`)
      .set("Cookie", authCookie(zhangsanId))
      .set("Idempotency-Key", `reject-${submit.body.id}`)
      .send({ instanceVersion: submit.body.version, comment: "预算不足" });
    expect(res.status).toBe(200);
    expect(res.body.approval.action).toBe("rejected");
    expect(res.body.approval.comment).toBe("预算不足");
    expect(res.body.instance.status).toBe("rejected");
  });

  it("400 when the comment is missing", async () => {
    const { submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1);
    const res = await request(app)
      .post(`/api/v1/approvals/${rec1.id}/reject`)
      .set("Cookie", authCookie(zhangsanId))
      .set("Idempotency-Key", `reject-nc-${submit.body.id}`)
      .send({ instanceVersion: submit.body.version });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("return → resubmit restart", () => {
  it("returns to the submitter, who edits and resubmits from node 1", async () => {
    const { instanceId, submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1);
    const rec2 = recordByOrder(submit, 2);

    const approve1 = await request(app)
      .post(`/api/v1/approvals/${rec1.id}/approve`)
      .set("Cookie", authCookie(zhangsanId))
      .set("Idempotency-Key", `rt-a1-${submit.body.id}`)
      .send({ instanceVersion: submit.body.version });
    expect(approve1.body.instance.status).toBe("in_approval");

    const ret = await request(app)
      .post(`/api/v1/approvals/${rec2.id}/return`)
      .set("Cookie", authCookie(adminId))
      .set("Idempotency-Key", `rt-return-${submit.body.id}`)
      .send({ instanceVersion: approve1.body.instance.version, comment: "请补充预算编号" });
    expect(ret.status).toBe(200);
    expect(ret.body.approval.action).toBe("returned");
    expect(ret.body.instance.status).toBe("returned");

    // The returned instance is editable again (autosave accepts it).
    const fixedValues = {
      ...validValues,
      "fld-004": "需要一台笔记本电脑用于日常开发工作（预算编号 ITB-2026-001）",
    };
    const save = await request(app)
      .put(`/api/v1/instances/${instanceId}/values`)
      .set("Cookie", authCookie(lisiId))
      .send({ field_values: fixedValues });
    expect(save.status).toBe(200);

    // Resubmit restarts the chain from the first node.
    const resubmit = await request(app)
      .post(`/api/v1/instances/${instanceId}/submit`)
      .set("Cookie", authCookie(lisiId))
      .send({ field_values: fixedValues });
    expect(resubmit.status).toBe(200);
    expect(resubmit.body.status).toBe("submitted");
    expect(resubmit.body.current_node_index).toBe(0);
    expect(resubmit.body.approval_records).toHaveLength(2);
    expect(resubmit.body.approval_records.every((r: { action: string }) => r.action === "pending")).toBe(true);
  });

  it("returns directly at the first node (submitted, no prior approve)", async () => {
    const { submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1);

    const ret = await request(app)
      .post(`/api/v1/approvals/${rec1.id}/return`)
      .set("Cookie", authCookie(zhangsanId))
      .set("Idempotency-Key", `rt-node1-${submit.body.id}`)
      .send({ instanceVersion: submit.body.version, comment: "请补充预算编号" });
    expect(ret.status).toBe(200);
    expect(ret.body.approval.action).toBe("returned");
    expect(ret.body.instance.status).toBe("returned");
    expect(ret.body.instance.current_node_index).toBe(0);
  });
});

describe("transfer", () => {
  it("reassigns the node and lets the new approver act", async () => {
    const { submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1);
    const rec2 = recordByOrder(submit, 2);

    const approve1 = await request(app)
      .post(`/api/v1/approvals/${rec1.id}/approve`)
      .set("Cookie", authCookie(zhangsanId))
      .set("Idempotency-Key", `tr-a1-${submit.body.id}`)
      .send({ instanceVersion: submit.body.version });
    expect(approve1.body.instance.status).toBe("in_approval");

    // admin 转交给 张三 (填写者+审批者，具备 approval:approve).
    const transfer = await request(app)
      .post(`/api/v1/approvals/${rec2.id}/transfer`)
      .set("Cookie", authCookie(adminId))
      .set("Idempotency-Key", `tr-x-${submit.body.id}`)
      .send({ instanceVersion: approve1.body.instance.version, targetUserId: zhangsanId });
    expect(transfer.status).toBe(200);
    expect(transfer.body.approval.approver_id).toBe(zhangsanId);
    expect(transfer.body.approval.transferred_from).toBe(adminId);
    expect(transfer.body.approval.action).toBe("pending");

    // 张三 now sees the node in his pending list and approves it.
    const pending = await request(app)
      .get("/api/v1/approvals/pending")
      .set("Cookie", authCookie(zhangsanId));
    expect(
      pending.body.items.some((i: { approval: { id: string } }) => i.approval.id === rec2.id),
    ).toBe(true);

    const approve2 = await request(app)
      .post(`/api/v1/approvals/${rec2.id}/approve`)
      .set("Cookie", authCookie(zhangsanId))
      .set("Idempotency-Key", `tr-a2-${submit.body.id}`)
      .send({ instanceVersion: transfer.body.instance.version });
    expect(approve2.status).toBe(200);
    expect(approve2.body.instance.status).toBe("approved");
  });

  it("transfers directly at the first node (submitted, no prior approve)", async () => {
    const { submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1);

    // 张三 (node-1 approver) hands node 1 straight to admin.
    const transfer = await request(app)
      .post(`/api/v1/approvals/${rec1.id}/transfer`)
      .set("Cookie", authCookie(zhangsanId))
      .set("Idempotency-Key", `tr-node1-${submit.body.id}`)
      .send({ instanceVersion: submit.body.version, targetUserId: adminId });
    expect(transfer.status).toBe(200);
    expect(transfer.body.approval.approver_id).toBe(adminId);
    expect(transfer.body.approval.transferred_from).toBe(zhangsanId);
    expect(transfer.body.approval.action).toBe("pending");
    // Transfer never changes the instance status — still submitted at node 1.
    expect(transfer.body.instance.status).toBe("submitted");

    // The new approver now owns the node.
    const pending = await request(app)
      .get("/api/v1/approvals/pending")
      .set("Cookie", authCookie(adminId));
    expect(
      pending.body.items.some((i: { approval: { id: string } }) => i.approval.id === rec1.id),
    ).toBe(true);
  });

  it("400 for a missing/invalid target user", async () => {
    const { submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1);
    const rec2 = recordByOrder(submit, 2);

    const approve1 = await request(app)
      .post(`/api/v1/approvals/${rec1.id}/approve`)
      .set("Cookie", authCookie(zhangsanId))
      .set("Idempotency-Key", `tr2-a1-${submit.body.id}`)
      .send({ instanceVersion: submit.body.version });

    const transfer = await request(app)
      .post(`/api/v1/approvals/${rec2.id}/transfer`)
      .set("Cookie", authCookie(adminId))
      .set("Idempotency-Key", `tr2-x-${submit.body.id}`)
      .send({
        instanceVersion: approve1.body.instance.version,
        targetUserId: "00000000-0000-0000-0000-000000000000",
      });
    expect(transfer.status).toBe(400);
    expect(transfer.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("withdraw vs approval race (工单 06: 后操作方 409)", () => {
  it("a stale approve after withdraw gets 409 INSTANCE_WITHDRAWN", async () => {
    const { instanceId, submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1);

    const withdraw = await request(app)
      .post(`/api/v1/instances/${instanceId}/withdraw`)
      .set("Cookie", authCookie(lisiId))
      .send({ version: submit.body.version });
    expect(withdraw.status).toBe(200);

    // The approver's page is stale: the record still exists (withdraw keeps the
    // rows), so the action resolves it and surfaces the withdrawal message.
    const approve = await request(app)
      .post(`/api/v1/approvals/${rec1.id}/approve`)
      .set("Cookie", authCookie(zhangsanId))
      .set("Idempotency-Key", `race-w-${submit.body.id}`)
      .send({ instanceVersion: submit.body.version });
    expect(approve.status).toBe(409);
    expect(approve.body.error.code).toBe("INSTANCE_WITHDRAWN");
    expect(approve.body.error.message).toContain("撤回");
  });

  it("a withdraw after an approver acted gets 409 APPROVAL_NOT_PENDING", async () => {
    const { instanceId, submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1);

    const approve = await request(app)
      .post(`/api/v1/approvals/${rec1.id}/approve`)
      .set("Cookie", authCookie(zhangsanId))
      .set("Idempotency-Key", `race-a-${submit.body.id}`)
      .send({ instanceVersion: submit.body.version });
    expect(approve.status).toBe(200);

    const withdraw = await request(app)
      .post(`/api/v1/instances/${instanceId}/withdraw`)
      .set("Cookie", authCookie(lisiId))
      .send({ version: submit.body.version });
    expect(withdraw.status).toBe(409);
    expect(withdraw.body.error.code).toBe("APPROVAL_NOT_PENDING");
    expect(withdraw.body.error.message).toContain("已处理");
  });
});

describe("approval notifications (ADR-0001)", () => {
  /**
   * Read the notification rows for an instance, polling until `until` passes —
   * the writes are post-commit and async (void'd), so the row for the action may
   * land a moment after the response. Returns the final snapshot.
   */
  async function rowsFor(
    instanceId: string,
    until: (rows: Array<{ type: string; recipient_id: string }>) => boolean = () => true,
  ) {
    const db = getDb();
    let rows: Array<{ type: string; recipient_id: string }> = [];
    for (let i = 0; i < 25; i++) {
      rows = await db("notifications")
        .where({ ref_id: instanceId })
        .select("type", "recipient_id");
      if (until(rows)) return rows;
      await new Promise((r) => setTimeout(r, 20));
    }
    return rows;
  }

  it("advance notifies the next approver, not the acting one", async () => {
    const { instanceId, submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1);
    await request(app)
      .post(`/api/v1/approvals/${rec1.id}/approve`)
      .set("Cookie", authCookie(zhangsanId))
      .set("Idempotency-Key", `nt-a-${submit.body.id}`)
      .send({ instanceVersion: submit.body.version });

    const rows = await rowsFor(
      instanceId,
      (rs) =>
        rs.filter((r) => r.type === "instance_submitted" && r.recipient_id === adminId)
          .length >= 2,
    );
    const submitted = rows.filter((r) => r.type === "instance_submitted");
    // Submit pings both nodes once; the advance pings the next approver again.
    expect(submitted.filter((r) => r.recipient_id === adminId)).toHaveLength(2);
    expect(submitted.filter((r) => r.recipient_id === zhangsanId)).toHaveLength(1);
  });

  it("final approve notifies the submitter (instance_approved)", async () => {
    const { instanceId, submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1);
    const rec2 = recordByOrder(submit, 2);
    const a1 = await request(app)
      .post(`/api/v1/approvals/${rec1.id}/approve`)
      .set("Cookie", authCookie(zhangsanId))
      .set("Idempotency-Key", `nt-a1-${submit.body.id}`)
      .send({ instanceVersion: submit.body.version });
    await request(app)
      .post(`/api/v1/approvals/${rec2.id}/approve`)
      .set("Cookie", authCookie(adminId))
      .set("Idempotency-Key", `nt-a2-${submit.body.id}`)
      .send({ instanceVersion: a1.body.instance.version });

    const rows = await rowsFor(
      instanceId,
      (rs) => rs.some((r) => r.type === "instance_approved" && r.recipient_id === lisiId),
    );
    expect(
      rows.some((r) => r.type === "instance_approved" && r.recipient_id === lisiId),
    ).toBe(true);
  });

  it("reject notifies the submitter (instance_rejected)", async () => {
    const { instanceId, submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1);
    await request(app)
      .post(`/api/v1/approvals/${rec1.id}/reject`)
      .set("Cookie", authCookie(zhangsanId))
      .set("Idempotency-Key", `nt-r-${submit.body.id}`)
      .send({ instanceVersion: submit.body.version, comment: "预算不足" });

    const rows = await rowsFor(
      instanceId,
      (rs) => rs.some((r) => r.type === "instance_rejected" && r.recipient_id === lisiId),
    );
    expect(
      rows.some((r) => r.type === "instance_rejected" && r.recipient_id === lisiId),
    ).toBe(true);
  });

  it("return notifies the submitter (instance_returned)", async () => {
    const { instanceId, submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1);
    const rec2 = recordByOrder(submit, 2);
    const a1 = await request(app)
      .post(`/api/v1/approvals/${rec1.id}/approve`)
      .set("Cookie", authCookie(zhangsanId))
      .set("Idempotency-Key", `nt-a1-${submit.body.id}`)
      .send({ instanceVersion: submit.body.version });
    await request(app)
      .post(`/api/v1/approvals/${rec2.id}/return`)
      .set("Cookie", authCookie(adminId))
      .set("Idempotency-Key", `nt-ret-${submit.body.id}`)
      .send({ instanceVersion: a1.body.instance.version, comment: "请补充" });

    const rows = await rowsFor(
      instanceId,
      (rs) => rs.some((r) => r.type === "instance_returned" && r.recipient_id === lisiId),
    );
    expect(
      rows.some((r) => r.type === "instance_returned" && r.recipient_id === lisiId),
    ).toBe(true);
  });

  it("transfer notifies the new approver (instance_transferred)", async () => {
    const { instanceId, submit } = await createAndSubmit();
    const rec1 = recordByOrder(submit, 1);
    await request(app)
      .post(`/api/v1/approvals/${rec1.id}/transfer`)
      .set("Cookie", authCookie(zhangsanId))
      .set("Idempotency-Key", `nt-tr-${submit.body.id}`)
      .send({ instanceVersion: submit.body.version, targetUserId: adminId });

    const rows = await rowsFor(
      instanceId,
      (rs) => rs.some((r) => r.type === "instance_transferred" && r.recipient_id === adminId),
    );
    expect(
      rows.some((r) => r.type === "instance_transferred" && r.recipient_id === adminId),
    ).toBe(true);
  });
});
