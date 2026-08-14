import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { closeDb, getDb } from "../db/connection";
import { runMigrations, runSeedIfEmpty } from "../db/migrate";
import { signAccessToken } from "../services/jwt";

/**
 * Draft API integration tests (work order 05). A draft is a lightweight,
 * template-version-independent save (CONTEXT.md "Draft"). The resume path applies
 * best-effort fieldId migration (ADR-0004): values for removed fields move to
 * `_orphaned` and `version_mismatch` is set.
 */

const app = createApp();

const COOKIE = "access_token";
/** Mint an access token and return it as a Cookie header (work order 17 auth). */
function authCookie(userId: string): string {
  return COOKIE + "=" + signAccessToken(userId);
}

let lisiId: string;
let publishedTemplateId: string;
const createdDraftIds: string[] = [];

beforeAll(async () => {
  await runMigrations();
  await runSeedIfEmpty();

  const db = getDb();
  const users = await db("users").select("id", "email");
  lisiId = users.find((u) => u.email === "lisi@example.com")?.id as string;
  const tpl = await db("form_templates").where({ name: "IT设备申领表" }).first();
  publishedTemplateId = tpl.id as string;
});

afterAll(async () => {
  const db = getDb();
  for (const id of createdDraftIds) {
    await db("drafts").where({ id }).del();
  }
  await closeDb();
});

function createDraft(fieldValues: Record<string, unknown> = {}) {
  return request(app)
    .post("/api/v1/drafts")
    .set("Cookie", authCookie(lisiId))
    .send({ template_id: publishedTemplateId, field_values: fieldValues });
}

describe("draft CRUD", () => {
  it("creates a draft", async () => {
    const res = await createDraft({ "fld-001": "李四" });
    expect(res.status).toBe(201);
    expect(res.body.template_id).toBe(publishedTemplateId);
    expect(res.body.field_values).toEqual({ "fld-001": "李四" });
    createdDraftIds.push(res.body.id);
  });

  it("lists the user's drafts", async () => {
    const res = await request(app)
      .get("/api/v1/drafts")
      .set("Cookie", authCookie(lisiId));
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it("resumes a draft without a version mismatch", async () => {
    const created = await createDraft({ "fld-001": "李四", "fld-002": "laptop" });
    createdDraftIds.push(created.body.id);

    const res = await request(app)
      .get(`/api/v1/drafts/${created.body.id}`)
      .set("Cookie", authCookie(lisiId));
    expect(res.status).toBe(200);
    expect(res.body.version_mismatch).toBe(false);
    expect(res.body.field_values).toEqual({ "fld-001": "李四", "fld-002": "laptop" });
  });

  it("updates a draft's field values", async () => {
    const created = await createDraft({ "fld-001": "李四" });
    createdDraftIds.push(created.body.id);

    const res = await request(app)
      .put(`/api/v1/drafts/${created.body.id}`)
      .set("Cookie", authCookie(lisiId))
      .send({ field_values: { "fld-001": "李四", "fld-003": 3 } });
    expect(res.status).toBe(200);
    expect(res.body.field_values).toEqual({ "fld-001": "李四", "fld-003": 3 });
  });

  it("discards a draft (204, then 404)", async () => {
    const created = await createDraft({ "fld-001": "李四" });
    const id = created.body.id;

    const del = await request(app)
      .delete(`/api/v1/drafts/${id}`)
      .set("Cookie", authCookie(lisiId));
    expect(del.status).toBe(204);

    const reload = await request(app)
      .get(`/api/v1/drafts/${id}`)
      .set("Cookie", authCookie(lisiId));
    expect(reload.status).toBe(404);
  });
});

describe("draft/template version-mismatch (ADR-0004)", () => {
  it("orphans values for removed fieldIds and flags the mismatch", async () => {
    // "fld-999" no longer exists in the current template schema.
    const created = await createDraft({
      "fld-001": "李四",
      "fld-999": "legacy-value",
    });
    createdDraftIds.push(created.body.id);

    const res = await request(app)
      .get(`/api/v1/drafts/${created.body.id}`)
      .set("Cookie", authCookie(lisiId));
    expect(res.status).toBe(200);
    expect(res.body.version_mismatch).toBe(true);
    expect(res.body.field_values).toEqual({ "fld-001": "李四" });
    expect(res.body._orphaned).toEqual({ "fld-999": "legacy-value" });
  });
});
