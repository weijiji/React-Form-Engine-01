import type { Knex } from "knex";
import { getDb } from "../db/connection";

type Queryable = Knex | Knex.Transaction;

interface ApprovalChainRefRow {
  id: string;
  name: string;
  status: string;
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
