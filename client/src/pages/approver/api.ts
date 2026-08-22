import { apiClient } from "../../config/api";
import type {
  ApprovalDetailResponse,
  ApprovalTargetListResponse,
  PendingApprovalListResponse,
} from "./types";

/**
 * Approval API client (work order 06). The approver's pending list and review
 * page read through `apiClient`; every write posts with a fresh `Idempotency-Key`
 * (ADR-0002) and the `instanceVersion` optimistic lock (ADR-0003) the detail was
 * read against — the server rejects a stale version with 409 VERSION_CONFLICT.
 *
 * A fresh key per click is correct idempotency: a *retry* of the same request
 * (network retry, page refresh mid-flight) replays the stored response, while a
 * deliberate second click gets a new key and re-executes against fresh state.
 */

export async function listPendingApprovals(): Promise<PendingApprovalListResponse> {
  return apiClient<PendingApprovalListResponse>("/approvals/pending");
}

export async function getApprovalDetail(
  recordId: string,
): Promise<ApprovalDetailResponse> {
  return apiClient<ApprovalDetailResponse>(`/approvals/${recordId}`);
}

/** Active users a pending node can be transferred to (powers the 转交 picker). */
export async function listApprovalTargets(): Promise<ApprovalTargetListResponse> {
  return apiClient<ApprovalTargetListResponse>("/approvals/options");
}

function action(
  path: string,
  body: { instanceVersion: number; comment?: string | null; targetUserId?: string },
): Promise<ApprovalDetailResponse> {
  return apiClient<ApprovalDetailResponse>(path, {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(body),
  });
}

export function approveApproval(
  recordId: string,
  instanceVersion: number,
): Promise<ApprovalDetailResponse> {
  return action(`/approvals/${recordId}/approve`, { instanceVersion });
}

export function rejectApproval(
  recordId: string,
  instanceVersion: number,
  comment: string,
): Promise<ApprovalDetailResponse> {
  return action(`/approvals/${recordId}/reject`, {
    instanceVersion,
    comment,
  });
}

export function returnApproval(
  recordId: string,
  instanceVersion: number,
  comment: string,
): Promise<ApprovalDetailResponse> {
  return action(`/approvals/${recordId}/return`, {
    instanceVersion,
    comment,
  });
}

export function transferApproval(
  recordId: string,
  instanceVersion: number,
  targetUserId: string,
): Promise<ApprovalDetailResponse> {
  return action(`/approvals/${recordId}/transfer`, {
    instanceVersion,
    targetUserId,
  });
}
