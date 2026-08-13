import { NextFunction, Request, Response } from "express";
import { AppError } from "../middleware/errorHandler";

export type Handler = (req: Request, res: Response) => Promise<unknown>;

/** Express 4 does not await async handlers; forward rejections to `next`. */
export function asyncHandler(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

export function clampInt(
  raw: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = typeof raw === "string" ? parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** Defensively parse a JSONB value the seed stores as a JSON string. */
export function parseJsonb(value: unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) : value;
}

/** Reject values that are not a plain object (e.g. `field_values` payloads). */
export function requireObject(value: unknown, label: string): void {
  if (
    value === undefined ||
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new AppError("VALIDATION_ERROR", `${label} 必须为对象`, 422);
  }
}

/** Split a comma-separated status filter (e.g. `?status=draft,submitted`). */
export function parseStatusList(raw: unknown): string[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
