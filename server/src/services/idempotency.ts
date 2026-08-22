import type { Knex } from "knex";
import { AppError } from "../middleware/errorHandler";

/**
 * Idempotent write helper (ADR-0002): approval writes require an
 * `Idempotency-Key` header with a 24h replay window.
 *
 * Claim-then-run pattern. The claim is an INSERT that leans on the unique
 * (key, user_id) index: a concurrent duplicate INSERT blocks on the uncommitted
 * row until this transaction resolves, then conflicts → 0 rows → the caller
 * re-reads the stored response and replays it. A failed `run()` (thrown
 * AppError) rolls the claim back with the transaction, so a retry with the same
 * key re-executes the action rather than silently replaying a failed one.
 *
 * `run()` returns a marker (typically the affected ids) — the response body is
 * rebuilt by the caller AFTER the transaction commits, so the replayed response
 * always reflects committed state.
 */

export async function runWithIdempotency<T>(
  trx: Knex.Transaction,
  userId: string,
  key: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  // Best-effort 24h window cleanup before claiming (cheap: created_at index).
  await trx("idempotency_keys")
    .where("created_at", "<", trx.raw("NOW() - INTERVAL '24 hours'"))
    .del();

  const claimResult = await trx("idempotency_keys")
    .insert({ key, user_id: userId, response: {} })
    .onConflict(["key", "user_id"])
    .ignore();
  // knex returns the pg INSERT result object (`{ rowCount }`); accept the few
  // other shapes knex versions may return so `0` (conflict) is detectable.
  const claimed =
    typeof claimResult === "number"
      ? claimResult
      : Array.isArray(claimResult)
        ? claimResult.length
        : (claimResult as { rowCount?: number }).rowCount ?? 0;

  if (claimed === 0) {
    const existing = await trx("idempotency_keys")
      .where({ key, user_id: userId })
      .first();
    // An empty `response` object means the claiming request is still in flight.
    if (existing && Object.keys(existing.response ?? {}).length > 0) {
      // Replay: the caller re-reads committed state and rebuilds the response.
      return existing.response as T;
    }
    throw new AppError(
      "IDEMPOTENCY_CONFLICT",
      "相同请求正在处理中，请稍后重试",
      409,
    );
  }

  const result = await run();
  await trx("idempotency_keys")
    .where({ key, user_id: userId })
    .update({ response: result as unknown as object });
  return result;
}

export function requireIdempotencyKey(req: {
  headers: Record<string, unknown>;
}): string {
  const key = req.headers["idempotency-key"];
  if (typeof key !== "string" || key.trim() === "") {
    throw new AppError("VALIDATION_ERROR", "缺少 Idempotency-Key 请求头", 400);
  }
  return key.trim();
}
