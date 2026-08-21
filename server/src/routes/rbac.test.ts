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
const createdUserIds: string[] = [];

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
  for (const id of createdUserIds) {
    await db("users").where({ id }).del();
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
  it("returns the 21 predefined permission codes", async () => {
    const { agent } = await adminSession();
    const res = await agent.get("/api/v1/permissions");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(21);
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

describe("privilege escalation guard — limited admin (only admin:manage_users)", () => {
  it("a manage_users-only admin must NOT be able to assign the 管理员 role", async () => {
    // 1) 管理员创建一个仅含 admin:manage_users 的「有限权限的管理员」角色。
    //    角色名带递增后缀，避免与现场/历史残留的同名角色冲突（422）。
    const roleName = `有限权限的管理员-${ipSeed}`;
    const { agent: adminAgent, csrf: adminCsrf } = await adminSession();
    const roleRes = await adminAgent
      .post("/api/v1/roles")
      .set("X-CSRF-Token", adminCsrf)
      .send({
        name: roleName,
        description: "BUG 测试角色",
        permissionCodes: ["admin:manage_users"],
      });
    expect(roleRes.status).toBe(201);
    const limitedRoleId = roleRes.body.id;
    createdRoleIds.push(limitedRoleId);

    // 2) 管理员创建一个仅持有该角色的测试账号。
    const email = `limited-${nextIp().replace(/\./g, "-")}@example.com`;
    const userRes = await adminAgent
      .post("/api/v1/users")
      .set("X-CSRF-Token", adminCsrf)
      .send({ name: "有限管理员", email, password: "temp123", roleIds: [limitedRoleId] });
    expect(userRes.status).toBe(201);
    const limitedUserId = userRes.body.id;
    createdUserIds.push(limitedUserId);

    // 3) 该账号登录：能管用户；角色目录（GET /roles）只返回「可授予」的角色
    //    （BUG-08/09 策略：manage_users 调用者可读目录，但仅见无管理类权限的角色）。
    const limitedAgent = request.agent(app);
    const login = await limitedAgent
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", nextIp())
      .send({ email, password: "temp123" });
    expect(login.status).toBe(200);
    expect(login.body.permissions).toContain("admin:manage_users");
    expect(login.body.permissions).not.toContain("admin:manage_roles");
    expect((await limitedAgent.get("/api/v1/users")).status).toBe(200);

    const catalog = await limitedAgent.get("/api/v1/roles");
    expect(catalog.status).toBe(200);
    const catalogNames = catalog.body.items.map((r: { name: string }) => r.name);
    expect(catalogNames).not.toContain("管理员"); // 管理类角色不可见
    expect(catalogNames).not.toContain(roleName); // 含 admin:manage_users 的也是管理类
    expect(catalogNames).toContain("填写者"); // 普通业务角色可见可授

    // 4) 越权尝试：给自己授予「管理员」角色 → 403（管理类角色，BUG-09 策略）。
    const exploit = await limitedAgent
      .post(`/api/v1/users/${limitedUserId}/roles`)
      .set("X-CSRF-Token", login.body.csrfToken as string)
      .send({ roleIds: [adminRoleId] });
    expect(exploit.status).toBe(403);

    // 5) 合法授予：普通业务角色（填写者）仍被允许（200）。
    const legit = await limitedAgent
      .post(`/api/v1/users/${limitedUserId}/roles`)
      .set("X-CSRF-Token", login.body.csrfToken as string)
      .send({ roleIds: [userRoleId] });
    expect(legit.status).toBe(200);
  });
});
