import type { Knex } from "knex";
import type { OrgDataSource, User } from "form-engine-core";
import { getDb } from "../db/connection";

/**
 * DB-backed {@link OrgDataSource} (CONTEXT.md "OrgDataSource").
 *
 * The engine resolves approvers through this read-only interface; the server
 * never mutates org data. Accepts an optional knex instance so the submit flow
 * can run resolution inside the same transaction that writes the snapshot and
 * approval records (ADR-0001: approver resolution happens in-transaction and a
 * failure rolls back the whole submission).
 */
type Queryable = Knex | Knex.Transaction;

function toEngineUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    departmentId: (row.department_id as string | null) ?? null,
    managerId: (row.manager_id as string | null) ?? null,
    isActive: row.is_active !== false,
  };
}

export function createDbOrgDataSource(db: Queryable = getDb()): OrgDataSource {
  return {
    async getUser(id: string) {
      const row = await db("users").where({ id }).first();
      return row ? toEngineUser(row) : null;
    },

    async searchUsers(query: string) {
      const rows = await db("users")
        .whereILike("name", `%${query}%`)
        .limit(20);
      return rows.map(toEngineUser);
    },

    async getUserManager(userId: string) {
      const user = await db("users").where({ id: userId }).first();
      if (!user?.manager_id) return null;
      const manager = await db("users")
        .where({ id: user.manager_id as string })
        .first();
      return manager ? toEngineUser(manager) : null;
    },

    async getUsersByDepartment(departmentId: string) {
      const rows = await db("users").where({ department_id: departmentId });
      return rows.map(toEngineUser);
    },

    async getUsersByRole(roleId: string) {
      const rows = await db("users_roles")
        .join("users", "users.id", "users_roles.user_id")
        .where("users_roles.role_id", roleId)
        .select("users.*");
      return rows.map(toEngineUser);
    },
  };
}
