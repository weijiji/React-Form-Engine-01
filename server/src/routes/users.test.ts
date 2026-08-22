import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { closeDb, getDb } from "../db/connection";
import { runMigrations, runSeedIfEmpty } from "../db/migrate";

/**
 * User CRUD integration tests (BUG-01, 二级 seam) — the list's pagination +
 * search/role/status filters, and the create / edit / delete endpoints with
 * their guards (email uniqueness, self-operation, has-templates).
 */

const app = createApp();

let adminId: string;
let fillerRoleId: string;
const createdUserIds: string[] = [];
const createdTemplateIds: string[] = [];
const createdRoleIds: string[] = [];

// Login is rate-limited per IP; each session logs in from a distinct IP.
let ipSeed = 0;
function nextIp(): string {
  ipSeed += 1;
  return `10.1.0.${ipSeed}`;
}

beforeAll(async () => {
  await runMigrations();
  await runSeedIfEmpty();

  const users = await getDb()("users").select("id", "email");
  adminId = users.find((u) => u.email === "admin@example.com")?.id as string;

  const roles = await getDb()("roles").select("id", "name");
  fillerRoleId = roles.find((r) => r.name === "填写者")?.id as string;

  expect(adminId && fillerRoleId).toBeTruthy();
});

afterAll(async () => {
  const db = getDb();
  for (const id of createdTemplateIds) {
    await db("form_templates").where({ id }).del();
  }
  for (const id of createdUserIds) {
    await db("users").where({ id }).del();
  }
  for (const id of createdRoleIds) {
    await db("roles").where({ id }).del();
  }
  await closeDb();
});

async function adminSession(): Promise<{ agent: request.Agent; csrf: string }> {
  const agent = request.agent(app);
  const login = await agent
    .post("/api/v1/auth/login")
    .set("X-Forwarded-For", nextIp())
    .send({ email: "admin@example.com", password: "admin123" });
  return { agent, csrf: login.body.csrfToken as string };
}

/** Create a user via the API and register it for cleanup. */
async function createUser(overrides: Record<string, unknown> = {}) {
  const { agent, csrf } = await adminSession();
  const res = await agent
    .post("/api/v1/users")
    .set("X-CSRF-Token", csrf)
    .send({
      name: "临时用户",
      email: `tmp-${nextIp().replace(/\./g, "-")}@example.com`,
      password: "temp123",
      ...overrides,
    });
  if (res.status === 201) createdUserIds.push(res.body.id);
  return res;
}

describe("GET /api/v1/users — pagination + filters", () => {
  it("returns the paginated envelope shape", async () => {
    const { agent } = await adminSession();
    const res = await agent.get("/api/v1/users");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      items: expect.any(Array),
      total: expect.any(Number),
      page: 1,
      pageSize: 20,
    });
    expect(res.body.total).toBeGreaterThanOrEqual(6);
  });

  it("honours pageSize", async () => {
    const { agent } = await adminSession();
    const res = await agent.get("/api/v1/users?pageSize=2");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.pageSize).toBe(2);
  });

  it("filters by name substring", async () => {
    const { agent } = await adminSession();
    const res = await agent.get("/api/v1/users?search=" + encodeURIComponent("张三"));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].name).toBe("张三");
  });

  it("filters by email substring", async () => {
    const { agent } = await adminSession();
    const res = await agent.get("/api/v1/users?search=zhangsan");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].email).toBe("zhangsan@example.com");
  });

  it("filters by role", async () => {
    const { agent } = await adminSession();
    const res = await agent.get(`/api/v1/users?roleId=${fillerRoleId}`);
    expect(res.status).toBe(200);
    const names = res.body.items.map((u: { name: string }) => u.name);
    expect(names).toEqual(expect.arrayContaining(["张三", "李四", "王五"]));
    expect(names).not.toContain("系统管理员");
  });

  it("filters by status", async () => {
    const created = await createUser({ name: "待停用用户" });
    const { agent, csrf } = await adminSession();
    await agent
      .patch(`/api/v1/users/${created.body.id}`)
      .set("X-CSRF-Token", csrf)
      .send({ is_active: false });

    const res = await agent.get("/api/v1/users?status=inactive");
    expect(res.status).toBe(200);
    const ids = res.body.items.map((u: { id: string }) => u.id);
    expect(ids).toContain(created.body.id);
  });
});

describe("POST /api/v1/users — create", () => {
  it("creates a user with an initial password and roles", async () => {
    const res = await createUser({ roleIds: [fillerRoleId] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "临时用户",
      is_active: true,
    });
    expect(res.body.roles.map((r: { id: string }) => r.id)).toContain(fillerRoleId);

    // The initial password actually works for login.
    const agent = request.agent(app);
    const login = await agent
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", nextIp())
      .send({ email: res.body.email, password: "temp123" });
    expect(login.status).toBe(200);
  });

  it("rejects a duplicate email (409 EMAIL_TAKEN)", async () => {
    const first = await createUser();
    const res = await createUser({ email: first.body.email });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects an invalid email (422)", async () => {
    const res = await createUser({ email: "not-an-email" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an empty password (422)", async () => {
    const res = await createUser({ password: "" });
    expect(res.status).toBe(422);
  });

  it("rejects an unknown role (422)", async () => {
    const res = await createUser({ roleIds: ["00000000-0000-0000-0000-000000000000"] });
    expect(res.status).toBe(422);
  });
});

describe("PATCH /api/v1/users/:id — edit", () => {
  it("renames a user", async () => {
    const created = await createUser();
    const { agent, csrf } = await adminSession();
    const res = await agent
      .patch(`/api/v1/users/${created.body.id}`)
      .set("X-CSRF-Token", csrf)
      .send({ name: "改名后" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("改名后");
  });

  it("rejects an email taken by another user (409 EMAIL_TAKEN)", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const { agent, csrf } = await adminSession();
    const res = await agent
      .patch(`/api/v1/users/${b.body.id}`)
      .set("X-CSRF-Token", csrf)
      .send({ email: a.body.email });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects disabling yourself (409 USER_SELF_OPERATION)", async () => {
    const { agent, csrf } = await adminSession();
    const res = await agent
      .patch(`/api/v1/users/${adminId}`)
      .set("X-CSRF-Token", csrf)
      .send({ is_active: false });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("USER_SELF_OPERATION");
  });
});

describe("DELETE /api/v1/users/:id — delete", () => {
  it("deletes a clean user (204) and removes it from the list", async () => {
    const created = await createUser();
    const { agent, csrf } = await adminSession();
    const del = await agent
      .delete(`/api/v1/users/${created.body.id}`)
      .set("X-CSRF-Token", csrf);
    expect(del.status).toBe(204);

    const list = await agent.get("/api/v1/users");
    expect(list.body.items.some((u: { id: string }) => u.id === created.body.id)).toBe(false);
  });

  it("rejects deleting yourself (409 USER_SELF_OPERATION)", async () => {
    const { agent, csrf } = await adminSession();
    const res = await agent
      .delete(`/api/v1/users/${adminId}`)
      .set("X-CSRF-Token", csrf);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("USER_SELF_OPERATION");
  });

  it("rejects deleting a user who created templates (409 USER_HAS_TEMPLATES)", async () => {
    const created = await createUser();
    const db = getDb();
    const [template] = await db("form_templates")
      .insert({ name: "临时模板", created_by: created.body.id })
      .returning("id");
    createdTemplateIds.push(template.id);

    const { agent, csrf } = await adminSession();
    const res = await agent
      .delete(`/api/v1/users/${created.body.id}`)
      .set("X-CSRF-Token", csrf);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("USER_HAS_TEMPLATES");
  });

  it("rejects deleting a user referenced in an approval chain (409 USER_REFERENCED_IN_APPROVAL_CHAIN)", async () => {
    const created = await createUser();
    const db = getDb();
    const [template] = await db("form_templates")
      .insert({
        name: "引用临时用户模板",
        created_by: adminId,
        approval_chain: JSON.stringify({
          nodes: [
            {
              id: "ref-node",
              order: 1,
              label: "指定审批",
              approverRule: { type: "specific", userId: created.body.id },
            },
          ],
        }),
      })
      .returning("id");
    createdTemplateIds.push(template.id);

    const { agent, csrf } = await adminSession();
    const res = await agent
      .delete(`/api/v1/users/${created.body.id}`)
      .set("X-CSRF-Token", csrf);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("USER_REFERENCED_IN_APPROVAL_CHAIN");
  });

  it("returns 404 for a missing user", async () => {
    const { agent, csrf } = await adminSession();
    const res = await agent
      .delete("/api/v1/users/00000000-0000-0000-0000-000000000000")
      .set("X-CSRF-Token", csrf);
    expect(res.status).toBe(404);
  });
});

// ── GET /api/v1/users/:id/approval-references (ADR-0015 决策 4) ───────────────

async function createRoleForRefs(name: string) {
  const { agent, csrf } = await adminSession();
  const res = await agent
    .post("/api/v1/roles")
    .set("X-CSRF-Token", csrf)
    .send({ name, permissionCodes: ["form:fill"] });
  if (res.status === 201) createdRoleIds.push(res.body.id);
  return res;
}

async function assignRoles(userId: string, roleIds: string[]) {
  const { agent, csrf } = await adminSession();
  await agent
    .post(`/api/v1/users/${userId}/roles`)
    .set("X-CSRF-Token", csrf)
    .send({ roleIds });
}

/** Insert a template with an arbitrary approval_chain and register it for cleanup. */
async function insertTemplateWithChain(chain: unknown): Promise<string> {
  const db = getDb();
  const [template] = await db("form_templates")
    .insert({
      name: `引用检索模板-${createdTemplateIds.length + 1}`,
      created_by: adminId,
      approval_chain: JSON.stringify(chain),
    })
    .returning("id");
  createdTemplateIds.push(template.id);
  return template.id;
}

describe("GET /api/v1/users/:id/approval-references — approval-chain references (ADR-0015 ④)", () => {
  it("returns templates that reference the user directly (specific rule)", async () => {
    const created = await createUser();
    const tplId = await insertTemplateWithChain({
      nodes: [
        {
          id: "ref-node-1",
          order: 1,
          label: "指定审批",
          approverRule: { type: "specific", userId: created.body.id },
        },
      ],
    });

    const { agent } = await adminSession();
    const res = await agent.get(
      `/api/v1/users/${created.body.id}/approval-references`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      templateId: tplId,
      refTypes: ["direct"],
    });
  });

  it("returns templates referenced through a role the user holds", async () => {
    const created = await createUser();
    const role = await createRoleForRefs(`引用角色-${nextIp()}`);
    await assignRoles(created.body.id, [role.body.id]);
    const tplId = await insertTemplateWithChain({
      nodes: [
        {
          id: "ref-node-2",
          order: 1,
          label: "角色审批",
          approverRule: { type: "role", roleId: role.body.id },
        },
      ],
    });

    const { agent } = await adminSession();
    const res = await agent.get(
      `/api/v1/users/${created.body.id}/approval-references`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      templateId: tplId,
      refTypes: ["role"],
      roles: [{ id: role.body.id, name: role.body.name }],
    });
  });

  it("a template referenced both directly and via role appears once with both refTypes", async () => {
    const created = await createUser();
    const role = await createRoleForRefs(`双重引用角色-${nextIp()}`);
    await assignRoles(created.body.id, [role.body.id]);
    const tplId = await insertTemplateWithChain({
      nodes: [
        {
          id: "ref-node-3a",
          order: 1,
          label: "指定审批",
          approverRule: { type: "specific", userId: created.body.id },
        },
        {
          id: "ref-node-3b",
          order: 2,
          label: "角色审批",
          approverRule: { type: "role", roleId: role.body.id },
        },
      ],
    });

    const { agent } = await adminSession();
    const res = await agent.get(
      `/api/v1/users/${created.body.id}/approval-references`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].templateId).toBe(tplId);
    expect(res.body.items[0].refTypes).toEqual(
      expect.arrayContaining(["direct", "role"]),
    );
    expect(res.body.items[0].roles).toEqual([
      { id: role.body.id, name: role.body.name },
    ]);
  });

  it("a template referenced by two of the user's roles lists \"role\" once and both roles", async () => {
    const created = await createUser();
    const roleA = await createRoleForRefs(`角色A-${nextIp()}`);
    const roleB = await createRoleForRefs(`角色B-${nextIp()}`);
    await assignRoles(created.body.id, [roleA.body.id, roleB.body.id]);
    const tplId = await insertTemplateWithChain({
      nodes: [
        {
          id: "ref-node-3c",
          order: 1,
          label: "角色审批",
          approverRule: { type: "role", roleId: roleA.body.id },
        },
        {
          id: "ref-node-3d",
          order: 2,
          label: "角色审批",
          approverRule: { type: "role", roleId: roleB.body.id },
        },
      ],
    });

    const { agent } = await adminSession();
    const res = await agent.get(
      `/api/v1/users/${created.body.id}/approval-references`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].templateId).toBe(tplId);
    // refTypes 去重：两个角色命中同一模板，也只出现一次 "role"。
    expect(res.body.items[0].refTypes).toEqual(["role"]);
    const roleIds = res.body.items[0].roles.map(
      (r: { id: string }) => r.id,
    );
    expect(roleIds).toEqual(
      expect.arrayContaining([roleA.body.id, roleB.body.id]),
    );
  });

  it("ignores org_structure rules (they name no user)", async () => {
    const created = await createUser();
    await insertTemplateWithChain({
      nodes: [
        {
          id: "ref-node-4",
          order: 1,
          label: "直属上级",
          approverRule: { type: "org_structure", relation: "direct_manager" },
        },
      ],
    });

    const { agent } = await adminSession();
    const res = await agent.get(
      `/api/v1/users/${created.body.id}/approval-references`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it("returns an empty list for a user no template references", async () => {
    const created = await createUser();
    const { agent } = await adminSession();
    const res = await agent.get(
      `/api/v1/users/${created.body.id}/approval-references`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it("returns 404 for a missing user", async () => {
    const { agent } = await adminSession();
    const res = await agent.get(
      "/api/v1/users/00000000-0000-0000-0000-000000000000/approval-references",
    );
    expect(res.status).toBe(404);
  });
});
