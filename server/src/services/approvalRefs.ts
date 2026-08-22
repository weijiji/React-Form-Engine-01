import type { Knex } from "knex";
import { getDb } from "../db/connection";

type Queryable = Knex | Knex.Transaction;

interface ApprovalChainRefRow {
  id: string;
  name: string;
  status: "draft" | "published" | "archived";
}

/**
 * Approval-chain reference queries (ADR-0015 决策 1). A user/role must not be
 * hard-deleted while a template's `approval_chain` still names it — JSONB has
 * no foreign keys, so the server enforces integrity with a `@>` containment
 * check at delete time.
 *
 * The stored chain uses camelCase keys (`nodes[].approverRule.userId / roleId`,
 * work order 10), so the containment document matches that exact shape.
 * `org_structure` rules name no user and are deliberately not searched.
 */

/**
 * Templates whose approval_chain contains a node whose `approverRule` includes
 * `fragment` (element-level `@>` containment). The fragment must be the rule
 * fragment unique to the reference — e.g. `{ type: "specific", userId }`.
 */
async function findTemplatesByApproverRule(
  fragment: Record<string, unknown>,
  db: Queryable = getDb(),
): Promise<ApprovalChainRefRow[]> {
  return db("form_templates")
    .whereRaw(
      "approval_chain @> ?::jsonb",
      JSON.stringify({ nodes: [{ approverRule: fragment }] }),
    )
    .select("id", "name", "status");
}

/** Templates whose approval_chain has a `specific` rule naming `userId`. */
export function templatesReferencingUser(
  userId: string,
  db: Queryable = getDb(),
): Promise<ApprovalChainRefRow[]> {
  return findTemplatesByApproverRule({ type: "specific", userId }, db);
}

/** Templates whose approval_chain has a `role` rule referencing `roleId`. */
export function templatesReferencingRole(
  roleId: string,
  db: Queryable = getDb(),
): Promise<ApprovalChainRefRow[]> {
  return findTemplatesByApproverRule({ type: "role", roleId }, db);
}

/**
 * One template that references a user, plus how it references them
 * (ADR-0015 决策 4 — the reference-search tool).
 */
export interface ApprovalReference {
  templateId: string;
  templateName: string;
  status: string;
  /** "direct" = a specific-user rule names the user; "role" = a rule names a role the user holds. */
  refTypes: Array<"direct" | "role">;
  /** The roles that cause the reference — present when refTypes includes "role". */
  roles?: Array<{ id: string; name: string }>;
}

/**
 * Templates whose approval_chain references `userId` — either directly (a
 * `specific` rule naming the user) or through a role the user holds (a `role`
 * rule naming one of their roles). `org_structure` rules are deliberately not
 * searched: they name no user, so editing them would not clear the reference.
 * A template referenced both ways appears once, with both ref types.
 */
export async function approvalReferencesForUser(
  userId: string,
  db: Queryable = getDb(),
): Promise<ApprovalReference[]> {
  const direct = await templatesReferencingUser(userId, db);

  const roleRows = await db("roles")
    .join("users_roles", "roles.id", "users_roles.role_id")
    .where("users_roles.user_id", userId)
    .select("roles.id", "roles.name");
  const roles = roleRows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
  }));

  // One query per held role — N+1 at MVP scale (~50 fillers, few roles) is
  // fine; a `whereIn` over role ids is the future consolidation if it grows.
  const byRole: Array<{ template: ApprovalChainRefRow; role: { id: string; name: string } }> = [];
  for (const role of roles) {
    for (const template of await templatesReferencingRole(role.id, db)) {
      byRole.push({ template, role });
    }
  }

  const items: ApprovalReference[] = [];
  const index = new Map<string, ApprovalReference>();
  for (const template of direct) {
    const item: ApprovalReference = {
      templateId: template.id,
      templateName: template.name,
      status: template.status,
      refTypes: ["direct"],
    };
    index.set(template.id, item);
    items.push(item);
  }
  for (const { template, role } of byRole) {
    const existing = index.get(template.id);
    if (existing) {
      // Dedup: a template hit via several of the user's roles still lists
      // "role" once, while `roles` keeps every role that causes the reference.
      if (!existing.refTypes.includes("role")) existing.refTypes.push("role");
      existing.roles = [...(existing.roles ?? []), role];
    } else {
      items.push({
        templateId: template.id,
        templateName: template.name,
        status: template.status,
        refTypes: ["role"],
        roles: [role],
      });
      index.set(template.id, items[items.length - 1]);
    }
  }
  return items;
}
