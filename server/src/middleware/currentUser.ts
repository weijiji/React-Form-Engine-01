import type { Request } from "express";
import { getDb } from "../db/connection";
import { AppError } from "./errorHandler";

export interface UserRow {
  id: string;
  name: string;
  email: string;
}

/**
 * Resolve the acting user. The MVP has no auth (issue 09), so identity is taken
 * from an `X-User-Id` header and falls back to the seeded designer (张三) when
 * absent — letting the client work unchanged while integration tests drive
 * different identities through the header.
 */
export async function resolveCurrentUser(req: Request): Promise<UserRow> {
  const db = getDb();
  const headerId = req.headers["x-user-id"];
  if (typeof headerId === "string" && headerId.trim() !== "") {
    const user = await db("users").where({ id: headerId.trim() }).first();
    if (!user) {
      throw new AppError("NOT_FOUND", "用户不存在", 404);
    }
    return user;
  }

  const fallback = await db("users")
    .where({ email: "zhangsan@example.com" })
    .first();
  if (!fallback) {
    throw new AppError("NOT_FOUND", "未找到默认演示用户，请先执行 seed", 404);
  }
  return fallback;
}
