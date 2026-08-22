import { getDb } from "../db/connection";
import { logger } from "../middleware/logger";

/**
 * Best-effort notification persistence, called *after* the write transaction
 * commits (ADR-0001: notification persist + SSE push are async, post-commit).
 * SSE push lands with work order 07; the issue-05/06 flows only persist the rows
 * so the notification center has something to read.
 */

/** One persisted notification row (ref always points at the instance). */
export interface ApprovalNotification {
  recipientId: string;
  type: string;
  title: string;
  content: string;
}

export async function notifyUsers(
  instanceId: string,
  notifications: ApprovalNotification[],
): Promise<void> {
  if (notifications.length === 0) return;
  const db = getDb();
  await Promise.all(
    notifications.map((n) =>
      db("notifications").insert({
        recipient_id: n.recipientId,
        type: n.type,
        title: n.title,
        content: n.content,
        ref_type: "instance",
        ref_id: instanceId,
      }),
    ),
  ).catch((err) => {
    logger.warn({ err, instanceId }, "Notification persist failed");
  });
}

/** The "action needed" ping for an approver holding the current node. */
export function newApprovalRequest(recipientId: string): ApprovalNotification {
  return {
    recipientId,
    type: "instance_submitted",
    title: "新的审批请求",
    content: "您有一条待审批的表单提交",
  };
}

/** Every approver of a freshly submitted instance gets an "action needed" ping. */
export function notifyApprovers(
  instanceId: string,
  approverIds: string[],
): Promise<void> {
  return notifyUsers(instanceId, approverIds.map(newApprovalRequest));
}
