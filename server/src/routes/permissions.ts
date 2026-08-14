import { Router, Request, Response } from "express";
import { getDb } from "../db/connection";
import { authenticate, requirePermission } from "../middleware/auth";
import { asyncHandler } from "./helpers";

/**
 * Permission catalog (work order 09). Mounted at `/api/v1/permissions`.
 *
 * Returns the 20 predefined permission codes (seeded from the design spec
 * §3.2), grouped by category — the checkbox source for the role editor.
 */

const router = Router();

// ── GET /api/v1/permissions — the predefined permission-code list ───────────
router.get(
  "/",
  authenticate,
  requirePermission("admin:manage_roles"),
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await getDb()("permissions")
      .select("id", "code", "name", "category")
      .orderBy("category", "asc")
      .orderBy("code", "asc");

    res.json({ items: rows });
  }),
);

export default router;
