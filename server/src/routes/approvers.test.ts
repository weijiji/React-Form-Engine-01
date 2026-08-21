import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { closeDb, getDb } from "../db/connection";
import { runMigrations, runSeedIfEmpty } from "../db/migrate";
import { signAccessToken } from "../services/jwt";

/**
 * GET /api/v1/approvers/options — the designer's approver catalog.
 *
 * Regression (设计器审批链伪 ID 硬编码): the approval-chain editor previously
 * hardcoded pseudo-ids ("zhangsan" / "it-manager") in its 指定人员 / 指定角色
 * dropdowns. The designer saved those fake ids into template JSONB, and
 * submit-time resolution failed with a raw Postgres `invalid input syntax for
 * type uuid`. The designer must instead fetch real users/roles here (real
 * UUIDs) to populate the dropdowns.
 */

const app = createApp();

const COOKIE = "access_token";
/** Mint an access token and return it as a Cookie header (work order 17 auth). */
function authCookie(userId: string): string {
  return COOKIE + "=" + signAccessToken(userId);
}

let designerId: string;
let zhangsanId: string;

beforeAll(async () => {
  await runMigrations();
  await runSeedIfEmpty();

  const db = getDb();
  const users = await db("users").select("id", "email");
  const byEmail = (email: string) =>
    users.find((u) => u.email === email)?.id as string;
  designerId = byEmail("designer@example.com");
  zhangsanId = byEmail("zhangsan@example.com");
});

afterAll(async () => {
  await closeDb();
});

describe("GET /api/v1/approvers/options", () => {
  it("returns real active users and all roles for a designer", async () => {
    const res = await request(app)
      .get("/api/v1/approvers/options")
      .set("Cookie", authCookie(designerId));
    expect(res.status).toBe(200);

    expect(Array.isArray(res.body.users)).toBe(true);
    expect(Array.isArray(res.body.roles)).toBe(true);
    // Real org data (real UUIDs), not the old hardcoded pseudo-ids.
    const userNames = res.body.users.map((u: { name: string }) => u.name);
    expect(userNames).toContain("张三");
    expect(userNames).toContain("李四");
    for (const u of res.body.users as Array<{ id: string }>) {
      // 与 orgDataSource 的 UUID_RE 一致——必须是真实 UUID，否则提交时解析失败。
      expect(u.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    }
    const roleNames = res.body.roles.map((r: { name: string }) => r.name);
    expect(roleNames).toContain("管理员");
    expect(roleNames).toContain("设计者");
  });

  it("forbids a filler who lacks template:create/edit (403)", async () => {
    const res = await request(app)
      .get("/api/v1/approvers/options")
      .set("Cookie", authCookie(zhangsanId));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});
