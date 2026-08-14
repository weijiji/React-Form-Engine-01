import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { closeDb, getDb } from "../db/connection";
import { runMigrations, runSeedIfEmpty } from "../db/migrate";

/**
 * RBAC integration tests (work order 09, 二级 seam) — role CRUD, the permission
 * catalog, and user↔role assignment, all gated behind admin permissions. Also
 * proves that a role change takes effect on the very next request.
 */

const app = createApp();

let adminId: string;
let zhangsanId: string;
let adminRoleId: string;
let userRoleId: string;
const createdRoleIds: string[] = [];

// Login is rate-limited per IP; each session logs in from a distinct IP so the
// many admin logins below never collide with the 5/min bucket.
let ipSeed = 0;
function nextIp(): string {
  ipSeed += 1;
  return `10.0.1.${ipSeed}`;
}

beforeAll(async () => {
  await runMigrations();
  await runSeedIfEmpty();

  const users = await getDb()("users").select("id", "email");
  adminId = users.find((u) => u.email === "admin@example.com")?.id as string;
  zhangsanId = users.find((u) => u.email === "zhangsan@example.com")?.id as string;

  const roles = await getDb()("roles").select("id", "name");
  adminRoleId = roles.find((r) => r.name === "管理员")?.id as string;
  userRoleId = roles.find((r) => r.name === "填写者")?.id as string;

  expect(adminId && zhangsanId && adminRoleId && userRoleId).toBeTruthy();
});

afterAll(async () => {
  const db = getDb();
  for (const id of createdRoleIds) {
    await db("roles").where({ id }).del();
  }
  // Restore 张三's roles in case the immediate-effect test was interrupted.
  await db("users_roles").where({ user_id: zhangsanId }).del();
  await db("users_roles").insert({ user_id: zhangsanId, role_id: userRoleId });
  await closeDb();
});

/** Admin agent + the CSRF token from its login (needed for mutating calls). */
async function adminSession(): Promise<{ agent: request.Agent; csrf: string }> {
  const agent = request.agent(app);
  const login = await agent
    .post("/api/v1/auth/login")
    .set("X-Forwarded-For", nextIp())
    .send({ email: "admin@example.com", password: "admin123" });
  return { agent, csrf: login.body.csrfToken as string };
}

describe("GET /api/v1/permissions", () => {
  it("returns the 20 predefined permission codes", async () => {
    const { agent } = await adminSession();
    const res = await agent.get("/api/v1/permissions");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(20);
    expect(res.body.items[0]).toMatchObject({ code: expect.any(String), name: expect.any(String), category: expect.any(String) });
  });
});

describe("role CRUD", () => {
  it("lists seeded roles with their permission codes", async () => {
    const { agent } = await adminSession();
    const res = await agent.get("/api/v1/roles");
    expect(res.status).toBe(200);
    const names = res.body.items.map((r: { name: string }) => r.name);
    expect(names).toContain("管理员");
    expect(names).toContain("填写者");

    const admin = res.body.items.find((r: { name: string }) => r.name === "管理员");
    expect(admin.permissions).toContain("template:create");
    expect(admin.permissions).toContain("admin:manage_roles");
  });

  it("creates a role with at least one permission", async () => {
    const { agent, csrf } = await adminSession();
    const res = await agent
      .post("/api/v1/roles")
      .set("X-CSRF-Token", csrf)
      .send({
        name: "测试角色A",
        description: "集成测试创建的角色",
        permissionCodes: ["form:fill", "form:submit"],
      });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("测试角色A");
    expect(res.body.permissions).toEqual(expect.arrayContaining(["form:fill", "form:submit"]));
    createdRoleIds.push(res.body.id);
  });

  it("rejects creating a role without permissions", async () => {
    const { agent, csrf } = await adminSession();
    const res = await agent
      .post("/api/v1/roles")
      .set("X-CSRF-Token", csrf)
      .send({ name: "测试角色空", permissionCodes: [] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an unknown permission code", async () => {
    const { agent, csrf } = await adminSession();
    const res = await agent
      .post("/api/v1/roles")
      .set("X-CSRF-Token", csrf)
      .send({ name: "测试角色坏码", permissionCodes: ["nope:no_such_code"] });
    expect(res.status).toBe(422);
  });

  it("rejects a duplicate role name", async () => {
    const { agent, csrf } = await adminSession();
    const res = await agent
      .post("/api/v1/roles")
      .set("X-CSRF-Token", csrf)
      .send({ name: "管理员", permissionCodes: ["form:fill"] });
    expect(res.status).toBe(422);
  });

  it("updates a role's name and permissions", async () => {
    const { agent, csrf } = await adminSession();
    const created = await agent
      .post("/api/v1/roles")
      .set("X-CSRF-Token", csrf)
      .send({ name: "测试角色B", permissionCodes: ["form:fill"] });
    createdRoleIds.push(created.body.id);

    const res = await agent
      .put(`/api/v1/roles/${created.body.id}`)
      .set("X-CSRF-Token", csrf)
      .send({ name: "测试角色B改", permissionCodes: ["data:view", "data:export"] });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("测试角色B改");
    expect(res.body.permissions).toEqual(expect.arrayContaining(["data:view", "data:export"]));
    expect(res.body.permissions).not.toContain("form:fill");
  });

  it("deletes a role", async () => {
    const { agent, csrf } = await adminSession();
    const created = await agent
      .post("/api/v1/roles")
      .set("X-CSRF-Token", csrf)
      .send({ name: "测试角色C", permissionCodes: ["form:fill"] });

    const del = await agent.delete(`/api/v1/roles/${created.body.id}`).set("X-CSRF-Token", csrf);
    expect(del.status).toBe(204);

    const list = await agent.get("/api/v1/roles");
    expect(list.body.items.some((r: { id: string }) => r.id === created.body.id)).toBe(false);
  });
});

describe("user role assignment", () => {
  it("lists users with their assigned roles", async () => {
    const { agent } = await adminSession();
    const res = await agent.get("/api/v1/users");
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(4);

    const zhangsan = res.body.items.find((u: { id: string }) => u.id === zhangsanId);
    expect(zhangsan.roles.map((r: { name: string }) => r.name)).toContain("填写者");
  });

  it("replaces a user's roles", async () => {
    const { agent, csrf } = await adminSession();
    const res = await agent
      .post(`/api/v1/users/${zhangsanId}/roles`)
      .set("X-CSRF-Token", csrf)
      .send({ roleIds: [adminRoleId, userRoleId] });
    expect(res.status).toBe(200);
    expect(res.body.items.map((r: { id: string }) => r.id)).toEqual(
      expect.arrayContaining([adminRoleId, userRoleId]),
    );

    // Restore so the later "immediate effect" test starts from seed state.
    await agent
      .post(`/api/v1/users/${zhangsanId}/roles`)
      .set("X-CSRF-Token", csrf)
      .send({ roleIds: [userRoleId] });
  });
});

describe("role changes take effect immediately", () => {
  it("grants a user new permissions on their very next request", async () => {
    // 张三 starts without admin:manage_roles.
    const zhangsanAgent = request.agent(app);
    const login = await zhangsanAgent
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", nextIp())
      .send({ email: "zhangsan@example.com", password: "user123" });
    expect(login.body.permissions).not.toContain("admin:manage_roles");

    const denied = await zhangsanAgent.get("/api/v1/roles");
    expect(denied.status).toBe(403);

    // Admin assigns 张三 the admin role.
    const { agent: adminAgent, csrf } = await adminSession();
    const assign = await adminAgent
      .post(`/api/v1/users/${zhangsanId}/roles`)
      .set("X-CSRF-Token", csrf)
      .send({ roleIds: [adminRoleId] });
    expect(assign.status).toBe(200);

    // Same token, no re-login — permissions are reloaded from DB per request.
    const allowed = await zhangsanAgent.get("/api/v1/roles");
    expect(allowed.status).toBe(200);

    // Restore 张三 to the seeded user role.
    await adminAgent
      .post(`/api/v1/users/${zhangsanId}/roles`)
      .set("X-CSRF-Token", csrf)
      .send({ roleIds: [userRoleId] });
  });
});
