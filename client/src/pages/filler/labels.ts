/** Shared Chinese labels for instance statuses and approval-record actions. */

export const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  submitted: "已提交",
  in_approval: "审批中",
  approved: "已通过",
  rejected: "已拒绝",
  returned: "已退回",
  withdrawn: "已撤回",
};

export const ACTION_LABEL: Record<string, string> = {
  pending: "待审批",
  approved: "已通过",
  rejected: "已拒绝",
  returned: "已退回",
  transferred: "已转交",
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("zh-CN", { hour12: false });
}
