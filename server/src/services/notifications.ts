import { getDb } from "../db/connection";
import { logger } from "../middleware/logger";

/**
 * Best-effort notification persistence, called *after* the submit transaction
 * commits (ADR-0001: notification persist + SSE push are async, post-commit).
 * SSE push lands with work order 07; issue 05 only persists the rows so the
 * approver area (issue 06) has something to read.
 */
export async function notifyApprovers(
  instanceId: string,
  approverIds: string[],
): Promise<void> {
  if (approverIds.length === 0) return;
  const db = getDb();
  await Promise.all(
    approverIds.map((recipientId) =>
      db("notifications").insert({
        recipient_id: recipientId,
        type: "instance_submitted",
        title: "新的审批请求",
        content: "您有一条待审批的表单提交",
        ref_type: "instance",
        ref_id: instanceId,
      }),
    ),
  ).catch((err) => {
    logger.warn({ err, instanceId }, "Notification persist failed");
  });
}
