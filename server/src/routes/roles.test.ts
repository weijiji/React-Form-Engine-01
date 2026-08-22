import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { closeDb, getDb } from "../db/connection";
import { runMigrations, runSeedIfEmpty } from "../db/migrate";

/**
 * Role CRUD integration tests — the delete endpoint's approval-chain reference
 * guard (ADR-0015 决策 1): a role referenced by a template's approval_chain
 * must not be hard-deleted.
 */

const app = createApp();

let adminId: string;
const createdRoleIds: string[] = [];
const createdTemplateIds: string[] = [];

let ipSeed = 0;
function nextIp(): string {
  ipSeed += 1;
  return `10.2.0.${ipSeed}`;
}

beforeAll(async () => {
  await runMigrations();
  await runSeedIfEmpty();

  const users = await getDb()("users").select("id", "email");
  adminId = users.find((u) => u.email === "admin@example.com")?.id as string;
  expect(adminId).toBeTruthy();
});

afterAll(async () => {
  const db = getDb();
  // Templates first — they hold the JSONB reference; roles follow.
  for (const id of createdTemplateIds) {
    await db("form_templates").where({ id }).del();
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

async function createRole(name: string) {
  const { agent, csrf } = await adminSession();
  const res = await agent
    .post("/api/v1/roles")
    .set("X-CSRF-Token", csrf)
    .send({ name, permissionCodes: ["form:fill"] });
  if (res.status === 201) createdRoleIds.push(res.body.id);
  return res;
}

/** Insert a template whose approval_chain references the role, and track it. */
async function insertTemplateReferencingRole(roleId: string): Promise<string> {
  const db = getDb();
  const [template] = await db("form_templates")
    .insert({
      name: "引用临时角色模板",
      created_by: adminId,
      approval_chain: JSON.stringify({
        nodes: [
          {
            id: "ref-role-node",
            order: 1,
            label: "角色审批",
            approverRule: { type: "role", roleId },
          },
        ],
      }),
    })
    .returning("id");
  createdTemplateIds.push(template.id);
  return template.id;
}

describe("DELETE /api/v1/roles/:id — delete", () => {
  it("deletes an unreferenced role (204)", async () => {
    const created = await createRole(`临时角色-${nextIp()}`);
    const { agent, csrf } = await adminSession();
    const res = await agent
      .delete(`/api/v1/roles/${created.body.id}`)
      .set("X-CSRF-Token", csrf);
    expect(res.status).toBe(204);
  });

  it("rejects deleting a role referenced in an approval chain (409 ROLE_REFERENCED_IN_APPROVAL_CHAIN)", async () => {
    const created = await createRole(`被引用角色-${nextIp()}`);
    await insertTemplateReferencingRole(created.body.id);

    const { agent, csrf } = await adminSession();
    const res = await agent
      .delete(`/api/v1/roles/${created.body.id}`)
      .set("X-CSRF-Token", csrf);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ROLE_REFERENCED_IN_APPROVAL_CHAIN");
  });

  it("returns 404 for a missing role", async () => {
    const { agent, csrf } = await adminSession();
    const res = await agent
      .delete("/api/v1/roles/00000000-0000-0000-0000-000000000000")
      .set("X-CSRF-Token", csrf);
    expect(res.status).toBe(404);
  });
});
