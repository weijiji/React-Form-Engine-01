import { getDb } from "../db/connection";
import { logger } from "../middleware/logger";
import { DRAFT_RETENTION_MS } from "./draftRetention";

/**
 * Purge expired draft-status instances (BR-15, ADR-0014). A draft idle for over
 * 2 years is deleted; submitted instances are records and are never touched.
 *
 * Runs once on startup, then on a 12h interval. The interval is `unref`'d so it
 * never keeps the process alive on its own. Correctness does not depend on this
 * job — instances.ts hides/rejects expired drafts on every read/write; the job
 * only reclaims the rows. Failures are logged and swallowed (best-effort).
 */
export function startDraftPurge(intervalMs = 12 * 60 * 60 * 1000): () => void {
  const purge = async (): Promise<void> => {
    try {
      const db = getDb();
      const cutoff = new Date(Date.now() - DRAFT_RETENTION_MS);
      const deleted = await db("form_instances")
        .where({ status: "draft" })
        .andWhere("updated_at", "<", cutoff)
        .del();
      if (deleted > 0) {
        logger.info({ count: deleted }, "Purged expired draft instances");
      }
    } catch (err) {
      logger.error({ err }, "Draft purge failed");
    }
  };

  void purge();
  const id = setInterval(() => void purge(), intervalMs);
  id.unref?.();
  return () => clearInterval(id);
}
