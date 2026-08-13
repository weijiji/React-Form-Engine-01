import { Router, Request, Response, NextFunction } from "express";
import { resolveCurrentUser } from "../middleware/currentUser";

const router = Router();

/**
 * GET /api/v1/me — resolve the acting user (pre-auth MVP: X-User-Id header or
 * the seeded designer fallback). Lets the client know "who am I" for the
 * designer's checkout badge and lock affordances before auth lands (issue 09).
 */
router.get("/api/v1/me", (req: Request, res: Response, next: NextFunction) => {
  resolveCurrentUser(req)
    .then((user) => res.json({ id: user.id, name: user.name, email: user.email }))
    .catch(next);
});

export default router;
