import { NextFunction, Request, Response, Router } from "express";
import { authenticate, requirePermission } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { generateSuggestion, refineSuggestion } from "../services/nl";
import { normalizeSuggestion, type FormStructureSuggestion } from "form-engine-core";

/**
 * NL 表单生成路由（工单 21，ADR-0013）。挂载于 `/api/v1/nl`。
 *
 * 两个端点都要求登录且持 `template:create`。生成端点 LLM 优先、规则兜底，
 * 双失败时返回 `{ suggestion: null }` 由客户端引导；refine 无 LLM 不可用
 * 时直接 503，不假装成功。
 */

const router = Router();

router.use(authenticate);
router.use(requirePermission("template:create"));

/** Express 4 does not await async handlers; forward rejections to `next`. */
type Handler = (req: Request, res: Response) => Promise<unknown>;
function asyncHandler(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

router.post(
  "/generate",
  asyncHandler(async (req: Request, res: Response) => {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message) {
      throw new AppError("VALIDATION_ERROR", "请描述你的表单需求", 422);
    }
    const suggestion = await generateSuggestion(message);
    res.json({ suggestion });
  }),
);

router.post(
  "/refine",
  asyncHandler(async (req: Request, res: Response) => {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message) {
      throw new AppError("VALIDATION_ERROR", "请输入要修改的内容", 422);
    }
    let current: FormStructureSuggestion;
    try {
      current = normalizeSuggestion(req.body?.suggestion);
    } catch {
      throw new AppError("VALIDATION_ERROR", "表单结构建议无效", 422);
    }
    const suggestion = await refineSuggestion(message, current);
    res.json({ suggestion });
  }),
);

export default router;
