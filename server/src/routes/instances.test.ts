import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { closeDb, getDb } from "../db/connection";
import { runMigrations, runSeedIfEmpty } from "../db/migrate";

/**
 * Form instance + form-center API integration tests (work order 05, 二级 seam).
 *
 * These exercise the full filler lifecycle against the seeded "IT设备申领表"
 * template (approval chain: 直属上级 → 系统管理员). Identity is injected via the
 * `X-User-Id` header. Key seams: submit atomicity (a resolution failure rolls back
 * the snapshot + approval records), template-offline rejection, and autosave→resume
 * consistency.
 */

const app = createApp();

let adminId: string;
let zhangsanId: string;
let lisiId: string;
let publishedTemplateId: string;

const createdTemplateIds: string[] = [];
const createdInstanceIds: string[] = [];

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
    .set("X-User-Id", userId)
    .send({ template_id: templateId });
}

describe("GET /api/v1/forms (form center)", () => {
  it("lists published forms only", async () => {
    const res = await request(app).get("/api/v1/forms");
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
    const tpl = await request(app)
      .post("/api/v1/templates")
      .set("X-User-Id", zhangsanId)
      .send({ name: "未发布模板" });
    createdTemplateIds.push(tpl.body.id);

    const res = await createDraftInstance(tpl.body.id);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("TEMPLATE_NOT_PUBLISHED");
  });

  it("autosaves field values and returns them on resume", async () => {
    const save = await request(app)
      .put(`/api/v1/instances/${instanceId}/values`)
      .set("X-User-Id", lisiId)
      .send({ field_values: validValues });
    expect(save.status).toBe(200);
    expect(save.body.field_values).toEqual(validValues);

    const reload = await request(app)
      .get(`/api/v1/instances/${instanceId}`)
      .set("X-User-Id", lisiId);
    expect(reload.status).toBe(200);
    expect(reload.body.field_values).toEqual(validValues);
  });

  it("rejects a values save by a non-owner (403)", async () => {
    const res = await request(app)
      .put(`/api/v1/instances/${instanceId}/values`)
      .set("X-User-Id", zhangsanId)
      .send({ field_values: validValues });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects submission with invalid values (422)", async () => {
    const res = await request(app)
      .post(`/api/v1/instances/${instanceId}/submit`)
      .set("X-User-Id", lisiId)
      .send({ field_values: { "fld-001": "李四" } });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toBeTruthy();
  });

  it("submits atomically, resolving the approval chain", async () => {
    const res = await request(app)
      .post(`/api/v1/instances/${instanceId}/submit`)
      .set("X-User-Id", lisiId)
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
      .set("X-User-Id", lisiId)
      .send({ field_values: validValues });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("VERSION_CONFLICT");
  });

  it("withdraws back to draft and clears pending records", async () => {
    const res = await request(app)
      .post(`/api/v1/instances/${instanceId}/withdraw`)
      .set("X-User-Id", lisiId)
      .send({ version: 2 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("draft");
    expect(res.body.approval_records).toHaveLength(0);
  });

  it("rejects withdrawing a non-withdrawable draft (400)", async () => {
    const res = await request(app)
      .post(`/api/v1/instances/${instanceId}/withdraw`)
      .set("X-User-Id", lisiId);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("resubmits after withdraw, then rejects a stale-version withdraw (409)", async () => {
    const submit = await request(app)
      .post(`/api/v1/instances/${instanceId}/submit`)
      .set("X-User-Id", lisiId)
      .send({ field_values: validValues });
    expect(submit.status).toBe(200);
    expect(submit.body.status).toBe("submitted");

    const withdraw = await request(app)
      .post(`/api/v1/instances/${instanceId}/withdraw`)
      .set("X-User-Id", lisiId)
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
      .set("X-User-Id", zhangsanId)
      .send({ field_values: validValues });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("APPROVER_RESOLUTION_FAILED");

    const detail = await request(app)
      .get(`/api/v1/instances/${instanceId}`)
      .set("X-User-Id", zhangsanId);
    expect(detail.body.status).toBe("draft");
    expect(detail.body.approval_records).toHaveLength(0);
  });
});
