/**
 * Draft retention policy (BR-15, ADR-0014): a draft-status instance idle for
 * over 2 years is expired — hidden from "我的表单", rejected with 410 on
 * open/save/submit, and purged by the background job (draftPurge.ts). This is
 * the single source of the window so the route guard and the purge job can't
 * drift.
 */
export const DRAFT_RETENTION_MS = 2 * 365 * 24 * 60 * 60 * 1000;

export function draftExpiredAt(updatedAt: Date): boolean {
  return updatedAt.getTime() < Date.now() - DRAFT_RETENTION_MS;
}
