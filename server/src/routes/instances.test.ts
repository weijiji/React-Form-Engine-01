import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { closeDb, getDb } from "../db/connection";
import { runMigrations, runSeedIfEmpty } from "../db/migrate";
import { signAccessToken } from "../services/jwt";

/**
 * Form instance + form-center API integration tests (work order 05, 二级 seam).
 *
 * These exercise the full filler lifecycle against the seeded "IT设备申领表"
 * template (approval chain: 直属上级 → 系统管理员). Identity is injected via a
 * minted access-token cookie (work order 17). Key seams: submit atomicity (a resolution failure rolls back
 * the snapshot + approval records), template-offline rejection, and autosave→resume
 * consistency.
 */

const app = createApp();

const COOKIE = "access_token";
/** Mint an access token and return it as a Cookie header (work order 17 auth). */
function authCookie(userId: string): string {
  return COOKIE + "=" + signAccessToken(userId);
}

let adminId: string;
let zhangsanId: string;
let lisiId: string;
let publishedTemplateId: string;

const createdTemplateIds: string[] = [];
const createdInstanceIds: string[] = [];
const createdUserIds: string[] = [];

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
  for (const id of createdTemplateIds) {
    await db("form_templates").where({ id }).del();
  }
  for (const id of createdUserIds) {
    await db("users").where({ id }).del();
  }
  await closeDb();
});

const validValues = {
  "fld-001": "李四",
  "fld-002": "laptop",
  "fld-003": 1,
  "fld-004": "需要一台笔记本电脑用于日常开发工作",
  "fld-005": "normal",
};

function createDraftInstance(
  templateId = publishedTemplateId,
  userId = lisiId,
): Promise<request.Response> {
  return request(app)
    .post("/api/v1/instances")
    .set("Cookie", authCookie(userId))
    .send({ template_id: templateId });
}

describe("GET /api/v1/forms (form center)", () => {
  it("lists published forms only", async () => {
    const res = await request(app)
      .get("/api/v1/forms")
      .set("Cookie", authCookie(lisiId));
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(
      res.body.items.some((f: { name: string }) => f.name === "IT设备申领表"),
    ).toBe(true);
  });
});

describe("instance lifecycle: create → autosave → submit → withdraw", () => {
  let instanceId: string;

  it("creates a draft instance for a published template", async () => {
    const res = await createDraftInstance();
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
    expect(res.body.submitted_by).toBe(lisiId);
    expect(res.body.field_values).toEqual({});
    instanceId = res.body.id;
    createdInstanceIds.push(instanceId);
  });

  it("rejects creating an instance for an unpublished template", async () => {
    // 创建需 template:create（ADR-0012），用管理员（admin 持有全量权限码）造一个草稿模板。
    const tpl = await request(app)
      .post("/api/v1/templates")
      .set("Cookie", authCookie(adminId))
      .send({ name: "未发布模板" });
    createdTemplateIds.push(tpl.body.id);

    const res = await createDraftInstance(tpl.body.id);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("TEMPLATE_NOT_PUBLISHED");
  });

  it("autosaves field values and returns them on resume", async () => {
    const save = await request(app)
      .put(`/api/v1/instances/${instanceId}/values`)
      .set("Cookie", authCookie(lisiId))
      .send({ field_values: validValues });
    expect(save.status).toBe(200);
    expect(save.body.field_values).toEqual(validValues);

    const reload = await request(app)
      .get(`/api/v1/instances/${instanceId}`)
      .set("Cookie", authCookie(lisiId));
    expect(reload.status).toBe(200);
    expect(reload.body.field_values).toEqual(validValues);
  });

  it("rejects a values save by a non-owner (403)", async () => {
    const res = await request(app)
      .put(`/api/v1/instances/${instanceId}/values`)
      .set("Cookie", authCookie(zhangsanId))
      .send({ field_values: validValues });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects submission with invalid values (422)", async () => {
    const res = await request(app)
      .post(`/api/v1/instances/${instanceId}/submit`)
      .set("Cookie", authCookie(lisiId))
      .send({ field_values: { "fld-001": "李四" } });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toBeTruthy();
  });

  it("submits atomically, resolving the approval chain", async () => {
    const res = await request(app)
      .post(`/api/v1/instances/${instanceId}/submit`)
      .set("Cookie", authCookie(lisiId))
      .send({ field_values: validValues });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("submitted");
    // 直属上级 (张三) + 系统管理员 (admin) — both resolved to pending records.
    expect(res.body.approval_records).toHaveLength(2);
    expect(res.body.approval_records.map((r: { approver_id: string }) => r.approver_id)).toEqual(
      expect.arrayContaining([zhangsanId, adminId]),
    );
    // Frozen snapshot captures the template schema for later read-only render.
    expect(res.body.template_snapshot.schema).toBeTruthy();
  });

  it("rejects resubmitting an already-submitted instance (409)", async () => {
    const res = await request(app)
      .post(`/api/v1/instances/${instanceId}/submit`)
      .set("Cookie", authCookie(lisiId))
      .send({ field_values: validValues });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("VERSION_CONFLICT");
  });

  it("withdraws back to draft and clears pending records", async () => {
    const res = await request(app)
      .post(`/api/v1/instances/${instanceId}/withdraw`)
      .set("Cookie", authCookie(lisiId))
      .send({ version: 2 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("draft");
    expect(res.body.approval_records).toHaveLength(0);
  });

  it("rejects withdrawing a non-withdrawable draft (400)", async () => {
    const res = await request(app)
      .post(`/api/v1/instances/${instanceId}/withdraw`)
      .set("Cookie", authCookie(lisiId));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("resubmits after withdraw, then rejects a stale-version withdraw (409)", async () => {
    const submit = await request(app)
      .post(`/api/v1/instances/${instanceId}/submit`)
      .set("Cookie", authCookie(lisiId))
      .send({ field_values: validValues });
    expect(submit.status).toBe(200);
    expect(submit.body.status).toBe("submitted");

    const withdraw = await request(app)
      .post(`/api/v1/instances/${instanceId}/withdraw`)
      .set("Cookie", authCookie(lisiId))
      .send({ version: 1 });
    expect(withdraw.status).toBe(409);
    expect(withdraw.body.error.code).toBe("VERSION_CONFLICT");
  });
});

describe("submit atomicity on approver-resolution failure", () => {
  it("rolls back the submit when a node cannot resolve (500, still draft)", async () => {
    // 张三 has no manager, so the first node (直属上级) cannot resolve.
    const created = await createDraftInstance(publishedTemplateId, zhangsanId);
    const instanceId = created.body.id;
    createdInstanceIds.push(instanceId);

    const res = await request(app)
      .post(`/api/v1/instances/${instanceId}/submit`)
      .set("Cookie", authCookie(zhangsanId))
      .send({ field_values: validValues });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("APPROVER_RESOLUTION_FAILED");

    const detail = await request(app)
      .get(`/api/v1/instances/${instanceId}`)
      .set("Cookie", authCookie(zhangsanId));
    expect(detail.body.status).toBe("draft");
    expect(detail.body.approval_records).toHaveLength(0);
  });
});

describe("disabled approver backstop (ADR-0015 ③)", () => {
  it("rejects submit with a clean 409 APPROVER_DISABLED and rolls back", async () => {
    // A `specific` approver who was later disabled (停用) must produce a clean
    // business error, not a 500, and the submit must roll back (still draft).
    const db = getDb();
    const [disabledUser] = await db("users")
      .insert({
        name: "被停用审批人",
        email: `disabled-approver-${createdUserIds.length}@example.com`,
        password_hash: "unused-hash",
        is_active: true,
      })
      .returning("id");
    createdUserIds.push(disabledUser.id);

    const tpl = await request(app)
      .post("/api/v1/templates")
      .set("Cookie", authCookie(adminId))
      .send({ name: "停用审批人模板" });
    createdTemplateIds.push(tpl.body.id);

    const put = await request(app)
      .put(`/api/v1/templates/${tpl.body.id}/schema`)
      .set("Cookie", authCookie(adminId))
      .send({
        schema: { schemaVersion: "1.0.0", sections: [] },
        approval_chain: {
          nodes: [
            {
              id: "n1",
              order: 1,
              label: "指定审批",
              approverRule: { type: "specific", userId: disabledUser.id },
            },
          ],
        },
      });
    expect(put.status).toBe(200);

    const publish = await request(app)
      .post(`/api/v1/templates/${tpl.body.id}/publish`)
      .set("Cookie", authCookie(adminId));
    expect(publish.status).toBe(200);

    // 停用 happens after publish — the live template still names the user.
    await db("users").where({ id: disabledUser.id }).update({ is_active: false });

    const created = await createDraftInstance(tpl.body.id, lisiId);
    const instanceId = created.body.id;
    createdInstanceIds.push(instanceId);

    const submit = await request(app)
      .post(`/api/v1/instances/${instanceId}/submit`)
      .set("Cookie", authCookie(lisiId))
      .send({ field_values: {} });
    expect(submit.status).toBe(409);
    expect(submit.body.error.code).toBe("APPROVER_DISABLED");
    expect(submit.body.error.message).toContain("已停用");

    // The submit rolled back inside the transaction (ADR-0001).
    const detail = await request(app)
      .get(`/api/v1/instances/${instanceId}`)
      .set("Cookie", authCookie(lisiId));
    expect(detail.body.status).toBe("draft");
    expect(detail.body.approval_records).toHaveLength(0);
  });
});

describe("approver-resolution hardening (non-UUID rule ids)", () => {
  it("reports a clean reason, not a Postgres uuid type error", async () => {
    // 设计器曾把伪 ID（"zhangsan"）写进 specific 规则；users.id 是 uuid 列，
    // 修复前会抛 `invalid input syntax for type uuid`。orgDataSource 现在对
    // 非 UUID id 短路，报错必须是干净的「指定审批人不存在」。
    const tpl = await request(app)
      .post("/api/v1/templates")
      .set("Cookie", authCookie(adminId))
      .send({ name: "坏审批人模板" });
    createdTemplateIds.push(tpl.body.id);

    const put = await request(app)
      .put(`/api/v1/templates/${tpl.body.id}/schema`)
      .set("Cookie", authCookie(adminId))
      .send({
        schema: { schemaVersion: "1.0.0", sections: [] },
        approval_chain: {
          nodes: [
            {
              id: "n1",
              order: 1,
              label: "直属上级审批",
              approverRule: { type: "specific", userId: "zhangsan" },
            },
          ],
        },
      });
    expect(put.status).toBe(200);

    const publish = await request(app)
      .post(`/api/v1/templates/${tpl.body.id}/publish`)
      .set("Cookie", authCookie(adminId));
    expect(publish.status).toBe(200);

    const created = await createDraftInstance(tpl.body.id, lisiId);
    const instanceId = created.body.id;
    createdInstanceIds.push(instanceId);

    const submit = await request(app)
      .post(`/api/v1/instances/${instanceId}/submit`)
      .set("Cookie", authCookie(lisiId))
      .send({ field_values: {} });
    expect(submit.status).toBe(500);
    expect(submit.body.error.code).toBe("APPROVER_RESOLUTION_FAILED");
    // 干净中文 reason，不再透出 Postgres 的裸类型错误。
    expect(submit.body.error.message).toContain('指定审批人 "zhangsan" 不存在');
    expect(submit.body.error.message).not.toContain("invalid input syntax");
  });

  it("reports a clean reason for a non-UUID role id (role_id is also uuid)", async () => {
    // 设计器伪 ID 的另一种形态：指定角色 ruleId 硬编码 "it-manager"。
    // role_id 同样是 uuid 列，修复前 getUsersByRole 同样抛裸类型错误。
    const tpl = await request(app)
      .post("/api/v1/templates")
      .set("Cookie", authCookie(adminId))
      .send({ name: "坏审批角色模板" });
    createdTemplateIds.push(tpl.body.id);

    const put = await request(app)
      .put(`/api/v1/templates/${tpl.body.id}/schema`)
      .set("Cookie", authCookie(adminId))
      .send({
        schema: { schemaVersion: "1.0.0", sections: [] },
        approval_chain: {
          nodes: [
            {
              id: "n1",
              order: 1,
              label: "角色审批",
              approverRule: { type: "role", roleId: "it-manager" },
            },
          ],
        },
      });
    expect(put.status).toBe(200);

    const publish = await request(app)
      .post(`/api/v1/templates/${tpl.body.id}/publish`)
      .set("Cookie", authCookie(adminId));
    expect(publish.status).toBe(200);

    const created = await createDraftInstance(tpl.body.id, lisiId);
    const instanceId = created.body.id;
    createdInstanceIds.push(instanceId);

    const submit = await request(app)
      .post(`/api/v1/instances/${instanceId}/submit`)
      .set("Cookie", authCookie(lisiId))
      .send({ field_values: {} });
    expect(submit.status).toBe(500);
    expect(submit.body.error.code).toBe("APPROVER_RESOLUTION_FAILED");
    expect(submit.body.error.message).toContain('角色 "it-manager" 下无可用用户');
    expect(submit.body.error.message).not.toContain("invalid input syntax");
  });
});

describe("owner-only instance reads (ADR-0014)", () => {
  it("forbids a non-owner from reading an instance (403)", async () => {
    const created = await createDraftInstance(publishedTemplateId, lisiId);
    const instanceId = created.body.id;
    createdInstanceIds.push(instanceId);

    const res = await request(app)
      .get(`/api/v1/instances/${instanceId}`)
      .set("Cookie", authCookie(zhangsanId));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});

describe("draft/template version mismatch (ADR-0004)", () => {
  it("migrates removed field values to _orphaned and flags version_mismatch", async () => {
    const created = await createDraftInstance();
    const instanceId = created.body.id;
    createdInstanceIds.push(instanceId);

    const save = await request(app)
      .put(`/api/v1/instances/${instanceId}/values`)
      .set("Cookie", authCookie(lisiId))
      .send({ field_values: { "fld-001": "李四", "fld-removed": "旧值" } });
    expect(save.status).toBe(200);

    const res = await request(app)
      .get(`/api/v1/instances/${instanceId}`)
      .set("Cookie", authCookie(lisiId));
    expect(res.status).toBe(200);
    expect(res.body.version_mismatch).toBe(true);
    expect(res.body._orphaned).toEqual({ "fld-removed": "旧值" });
    // Still-valid fields stay in field_values; the removed field does not.
    expect(res.body.field_values["fld-001"]).toBe("李四");
    expect(res.body.field_values["fld-removed"]).toBeUndefined();
  });

  it("preserves _orphaned through autosave when the client sends it back", async () => {
    const created = await createDraftInstance();
    const instanceId = created.body.id;
    createdInstanceIds.push(instanceId);

    // Simulate the filler: it receives `_orphaned` on GET and merges it back
    // into field_values on PUT /values (FormFillPage).
    const save = await request(app)
      .put(`/api/v1/instances/${instanceId}/values`)
      .set("Cookie", authCookie(lisiId))
      .send({
        field_values: { "fld-001": "李四", _orphaned: { "fld-removed": "旧值" } },
      });
    expect(save.status).toBe(200);

    const res = await request(app)
      .get(`/api/v1/instances/${instanceId}`)
      .set("Cookie", authCookie(lisiId));
    expect(res.body.version_mismatch).toBe(true);
    expect(res.body._orphaned).toEqual({ "fld-removed": "旧值" });
  });

  it("submit with _orphaned in field_values still passes validation", async () => {
    const created = await createDraftInstance();
    const instanceId = created.body.id;
    createdInstanceIds.push(instanceId);

    const res = await request(app)
      .post(`/api/v1/instances/${instanceId}/submit`)
      .set("Cookie", authCookie(lisiId))
      .send({
        field_values: { ...validValues, _orphaned: { "fld-removed": "旧值" } },
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("submitted");
    // `_orphaned` never participates in the written record (ADR-0014 §3).
    expect(res.body.field_values["_orphaned"]).toBeUndefined();
  });
});

describe("draft retention (BR-15, ADR-0014)", () => {
  async function backdate(id: string, days: number) {
    await getDb()("form_instances")
      .where({ id })
      .update({ updated_at: new Date(Date.now() - days * 24 * 60 * 60 * 1000) });
  }

  it("returns 410 DRAFT_EXPIRED for an expired draft on GET/PUT/submit", async () => {
    const created = await createDraftInstance();
    const instanceId = created.body.id;
    createdInstanceIds.push(instanceId);
    await backdate(instanceId, 800); // > 2 years

    const get = await request(app)
      .get(`/api/v1/instances/${instanceId}`)
      .set("Cookie", authCookie(lisiId));
    expect(get.status).toBe(410);
    expect(get.body.error.code).toBe("DRAFT_EXPIRED");

    const put = await request(app)
      .put(`/api/v1/instances/${instanceId}/values`)
      .set("Cookie", authCookie(lisiId))
      .send({ field_values: validValues });
    expect(put.status).toBe(410);
    expect(put.body.error.code).toBe("DRAFT_EXPIRED");

    const submit = await request(app)
      .post(`/api/v1/instances/${instanceId}/submit`)
      .set("Cookie", authCookie(lisiId))
      .send({ field_values: validValues });
    expect(submit.status).toBe(410);
    expect(submit.body.error.code).toBe("DRAFT_EXPIRED");
  });

  it("hides expired drafts from /instances/my (they disappear entirely)", async () => {
    const fresh = await createDraftInstance();
    createdInstanceIds.push(fresh.body.id);

    const expired = await createDraftInstance();
    createdInstanceIds.push(expired.body.id);
    await backdate(expired.body.id, 800);

    const res = await request(app)
      .get("/api/v1/instances/my?page=1&pageSize=100")
      .set("Cookie", authCookie(lisiId));
    expect(res.status).toBe(200);
    const ids = res.body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(fresh.body.id);
    expect(ids).not.toContain(expired.body.id);
  });
});

describe("no-chain template", () => {
  it("submits straight to approved when the approval chain is empty", async () => {
    const tpl = await request(app)
      .post("/api/v1/templates")
      .set("Cookie", authCookie(adminId))
      .send({ name: "无审批流程模板" });
    createdTemplateIds.push(tpl.body.id);

    const publish = await request(app)
      .post(`/api/v1/templates/${tpl.body.id}/publish`)
      .set("Cookie", authCookie(adminId));
    expect(publish.status).toBe(200);

    const created = await createDraftInstance(tpl.body.id, lisiId);
    const instanceId = created.body.id;
    createdInstanceIds.push(instanceId);

    const submit = await request(app)
      .post(`/api/v1/instances/${instanceId}/submit`)
      .set("Cookie", authCookie(lisiId))
      .send({ field_values: {} });
    expect(submit.status).toBe(200);
    expect(submit.body.status).toBe("approved");
    expect(submit.body.approval_records).toHaveLength(0);
  });
});

describe("my-instances list filter", () => {
  it("filters /instances/my by status", async () => {
    const draft = await createDraftInstance();
    createdInstanceIds.push(draft.body.id);

    const submitted = await createDraftInstance();
    createdInstanceIds.push(submitted.body.id);
    const sub = await request(app)
      .post(`/api/v1/instances/${submitted.body.id}/submit`)
      .set("Cookie", authCookie(lisiId))
      .send({ field_values: validValues });
    expect(sub.status).toBe(200);

    const drafts = await request(app)
      .get("/api/v1/instances/my?page=1&pageSize=100&status=draft")
      .set("Cookie", authCookie(lisiId));
    expect(
      drafts.body.items.map((i: { id: string }) => i.id),
    ).toContain(draft.body.id);
    expect(
      drafts.body.items.map((i: { id: string }) => i.id),
    ).not.toContain(submitted.body.id);

    const submittedList = await request(app)
      .get("/api/v1/instances/my?page=1&pageSize=100&status=submitted")
      .set("Cookie", authCookie(lisiId));
    expect(
      submittedList.body.items.map((i: { id: string }) => i.id),
    ).toContain(submitted.body.id);
  });
});
