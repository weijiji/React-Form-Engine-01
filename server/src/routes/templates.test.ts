import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { closeDb, getDb } from "../db/connection";
import { runMigrations, runSeedIfEmpty } from "../db/migrate";
import { signAccessToken } from "../services/jwt";

/**
 * Template API integration tests (work order 04, 二级 seam).
 *
 * These hit the real app (`createApp()`) through supertest against the configured
 * database, exercising the full designer lifecycle and the lock-conflict paths.
 * Identity is injected via a minted access-token cookie (work order 17).
 */

const app = createApp();

const COOKIE = "access_token";
/** Mint an access token and return it as a Cookie header (work order 17 auth). */
function authCookie(userId: string): string {
  return COOKIE + "=" + signAccessToken(userId);
}

let zhangsanId: string;
let lisiId: string;
let adminId: string;
let designerId: string;
const createdIds: string[] = [];

beforeAll(async () => {
  await runMigrations();
  await runSeedIfEmpty();

  const users = await getDb()("users").select("id", "email");
  const byEmail = (email: string) =>
    users.find((u) => u.email === email)?.id as string;

  zhangsanId = byEmail("zhangsan@example.com");
  lisiId = byEmail("lisi@example.com");
  adminId = byEmail("admin@example.com");
  designerId = byEmail("designer@example.com");
  expect(zhangsanId).toBeTruthy();
  expect(lisiId).toBeTruthy();
  expect(adminId).toBeTruthy();
  expect(designerId).toBeTruthy();
});

afterAll(async () => {
  const db = getDb();
  for (const id of createdIds) {
    await db("form_templates").where({ id }).del();
  }
  await closeDb();
});

function newTemplate(name = "集成测试模板"): Promise<request.Response> {
  return newTemplateAs(zhangsanId, name);
}

/** Create a template as a specific user (used by the DELETE permission/lock tests). */
function newTemplateAs(
  userId: string,
  name = "集成测试模板",
): Promise<request.Response> {
  return request(app)
    .post("/api/v1/templates")
    .set("Cookie", authCookie(userId))
    .send({ name, category: "测试" });
}

describe("POST /api/v1/templates (create + auto-checkout)", () => {
  it("creates a draft template checked out to the creator", async () => {
    const res = await newTemplate();
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("集成测试模板");
    expect(res.body.status).toBe("draft");
    expect(res.body.locked_by).toBe(zhangsanId);
    expect(res.body.version).toBe(1);
    createdIds.push(res.body.id);
  });

  it("rejects a missing or blank name", async () => {
    const res = await request(app)
      .post("/api/v1/templates")
      .set("Cookie", authCookie(zhangsanId))
      .send({ name: "   " });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("template lifecycle: create → checkout → edit → checkin → publish", () => {
  let templateId: string;

  beforeAll(async () => {
    const res = await newTemplate("全流程模板");
    templateId = res.body.id;
    createdIds.push(templateId);
  });

  it("lists the created template (searchable)", async () => {
    const res = await request(app)
      .get("/api/v1/templates")
      .set("Cookie", authCookie(zhangsanId))
      .query({ search: "全流程" });
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.items.some((t: { id: string }) => t.id === templateId)).toBe(
      true,
    );
  });

  it("returns detail with schema and approval_chain", async () => {
    const res = await request(app)
      .get(`/api/v1/templates/${templateId}`)
      .set("Cookie", authCookie(zhangsanId));
    expect(res.status).toBe(200);
    expect(res.body.schema).toEqual({ schemaVersion: "1.0.0", sections: [] });
    expect(res.body.approval_chain).toBeNull();
  });

  it("saves the schema when the caller holds the lock", async () => {
    const schema = { schemaVersion: "1.0.0", sections: [{ id: "s1", title: "章节", fields: [] }] };
    const res = await request(app)
      .put(`/api/v1/templates/${templateId}/schema`)
      .set("Cookie", authCookie(zhangsanId))
      .send({ schema, approval_chain: { nodes: [] } });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(2);
    expect(res.body.schema).toEqual(schema);
  });

  it("rejects a schema save by a non-holder (409)", async () => {
    const res = await request(app)
      .put(`/api/v1/templates/${templateId}/schema`)
      .set("Cookie", authCookie(lisiId))
      .send({ schema: { schemaVersion: "1.0.0", sections: [] } });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TEMPLATE_LOCKED");
  });

  it("rejects a checkout by another user while locked (409)", async () => {
    const res = await request(app)
      .post(`/api/v1/templates/${templateId}/checkout`)
      .set("Cookie", authCookie(lisiId));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TEMPLATE_LOCKED");
  });

  it("is idempotent when the holder re-checks-out", async () => {
    const res = await request(app)
      .post(`/api/v1/templates/${templateId}/checkout`)
      .set("Cookie", authCookie(zhangsanId));
    expect(res.status).toBe(200);
    expect(res.body.locked_by).toBe(zhangsanId);
  });

  it("releases the lock on checkin", async () => {
    const res = await request(app)
      .post(`/api/v1/templates/${templateId}/checkin`)
      .set("Cookie", authCookie(zhangsanId));
    expect(res.status).toBe(200);
    expect(res.body.locked_by).toBeNull();
  });

  it("rejects a schema save when not checked out (409)", async () => {
    const res = await request(app)
      .put(`/api/v1/templates/${templateId}/schema`)
      .set("Cookie", authCookie(zhangsanId))
      .send({ schema: { schemaVersion: "1.0.0", sections: [] } });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TEMPLATE_LOCKED");
  });

  it("publishes the template (draft → published)", async () => {
    const res = await request(app)
      .post(`/api/v1/templates/${templateId}/publish`)
      .set("Cookie", authCookie(zhangsanId));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("published");
  });

  it("rejects publishing a non-draft template", async () => {
    const res = await request(app)
      .post(`/api/v1/templates/${templateId}/publish`)
      .set("Cookie", authCookie(zhangsanId));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("TEMPLATE_NOT_DRAFT");
  });
});

describe("force-unlock", () => {
  it("clears the lock regardless of holder", async () => {
    const res = await newTemplate("待解锁模板");
    const templateId = res.body.id;
    createdIds.push(templateId);
    expect(res.body.locked_by).toBe(zhangsanId);

    const unlock = await request(app)
      .post(`/api/v1/templates/${templateId}/force-unlock`)
      .set("Cookie", authCookie(lisiId));
    expect(unlock.status).toBe(200);
    expect(unlock.body.locked_by).toBeNull();
  });
});

describe("DELETE /api/v1/templates/:id (template:delete + lock holder)", () => {
  it("deletes a draft template the caller holds (204) and it is gone afterwards", async () => {
    const res = await newTemplateAs(adminId, "待删除模板");
    const templateId = res.body.id;
    expect(res.body.status).toBe("draft");
    expect(res.body.locked_by).toBe(adminId);

    const del = await request(app)
      .delete(`/api/v1/templates/${templateId}`)
      .set("Cookie", authCookie(adminId));
    expect(del.status).toBe(204);

    const after = await request(app)
      .get(`/api/v1/templates/${templateId}`)
      .set("Cookie", authCookie(adminId));
    expect(after.status).toBe(404);
  });

  it("rejects deleting a published template (400)", async () => {
    const res = await newTemplateAs(adminId, "已发布不可删");
    const templateId = res.body.id;
    createdIds.push(templateId);

    await request(app)
      .post(`/api/v1/templates/${templateId}/publish`)
      .set("Cookie", authCookie(adminId));

    const del = await request(app)
      .delete(`/api/v1/templates/${templateId}`)
      .set("Cookie", authCookie(adminId));
    expect(del.status).toBe(400);
    expect(del.body.error.code).toBe("TEMPLATE_NOT_DRAFT");
  });

  it("returns 404 for an unknown template", async () => {
    const res = await request(app)
      .delete("/api/v1/templates/00000000-0000-0000-0000-000000000000")
      .set("Cookie", authCookie(adminId));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("rejects a delete by a non-holder who has the permission (409)", async () => {
    const res = await newTemplateAs(adminId, "他人签出不可删");
    const templateId = res.body.id;
    createdIds.push(templateId);

    const del = await request(app)
      .delete(`/api/v1/templates/${templateId}`)
      .set("Cookie", authCookie(designerId));
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe("TEMPLATE_LOCKED");
  });

  it("rejects a delete by a user without template:delete (403)", async () => {
    const res = await newTemplateAs(adminId, "无权限不可删");
    const templateId = res.body.id;
    createdIds.push(templateId);

    const del = await request(app)
      .delete(`/api/v1/templates/${templateId}`)
      .set("Cookie", authCookie(lisiId));
    expect(del.status).toBe(403);
    expect(del.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects a delete when the draft is not checked out (409)", async () => {
    const res = await newTemplateAs(adminId, "未签出不可删");
    const templateId = res.body.id;
    createdIds.push(templateId);

    // Release the lock (checkin) — the template is still a draft.
    await request(app)
      .post(`/api/v1/templates/${templateId}/checkin`)
      .set("Cookie", authCookie(adminId));

    const del = await request(app)
      .delete(`/api/v1/templates/${templateId}`)
      .set("Cookie", authCookie(adminId));
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe("TEMPLATE_LOCKED");
  });
});

describe("GET /api/v1/templates/:id (missing)", () => {
  it("returns 404 for an unknown template", async () => {
    const res = await request(app)
      .get("/api/v1/templates/00000000-0000-0000-0000-000000000000")
      .set("Cookie", authCookie(zhangsanId));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
