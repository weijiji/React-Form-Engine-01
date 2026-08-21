import { Router, Request, Response } from "express";
import { getDb } from "../db/connection";
import { authenticate, requireAnyPermission } from "../middleware/auth";
import { asyncHandler } from "./helpers";

/**
 * Approver option catalog (bugfix: designer approval-chain editor).
 * Mounted at `/api/v1/approvers`.
 *
 * Returns the real users and roles the designer's chain editor offers for the
 * `specific` (指定人员) and `role` (指定角色) approval rules. The editor used to
 * hardcode fake ids ("zhangsan", "it-manager") that could never resolve at
 * submit time — these options carry real UUIDs from the org data so a designed
 * chain actually submits.
 *
 * Gated on template editing: assembling an approval chain is a designer action;
 * user/role administration stays behind the `admin:*` gates.
 */
const router = Router();

router.use(authenticate);

// ── GET /api/v1/approvers/options — users + roles for approval rules ────────
router.get(
  "/options",
  requireAnyPermission("template:create", "template:edit"),
  asyncHandler(async (_req: Request, res: Response) => {
    const db = getDb();
    const users = await db("users")
      .where({ is_active: true })
      .orderBy("name", "asc")
      .limit(500)
      .select("id", "name");
    const roles = await db("roles")
      .orderBy("name", "asc")
      .select("id", "name");
    res.json({ users, roles });
  }),
);

export default router;
