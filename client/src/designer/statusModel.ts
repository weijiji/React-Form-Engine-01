import type { FormTemplate } from "./types";

/** 状态徽章语义配色档位（映射 `.et-status.is-*` 变体，BUG-05）。 */
export type StatusKind =
  | "holder"
  | "locked"
  | "published"
  | "archived"
  | "draft";

export interface DesignerStatus {
  text: string;
  kind: StatusKind;
}

/**
 * 由模板的锁定/发布状态推导设计器顶栏状态徽章（文案 + 语义配色 kind）。
 * 判定顺序敏感：持锁优先于「被他人锁定」，再优先于 published/archived，
 * 兜底为未签出的草稿。纯函数，便于单测状态→配色的映射。
 */
export function resolveStatus(
  template: Pick<FormTemplate, "status" | "locked_by" | "locked_by_name"> | null,
  isHolder: boolean,
): DesignerStatus {
  if (isHolder) return { text: "已签出 · 正在编辑", kind: "holder" };
  if (template?.locked_by) {
    return {
      text: `已锁定 · ${template.locked_by_name ?? "他人"}`,
      kind: "locked",
    };
  }
  if (template?.status === "published") {
    return { text: "已发布", kind: "published" };
  }
  if (template?.status === "archived") {
    return { text: "已归档 · 只读", kind: "archived" };
  }
  return { text: "未签出", kind: "draft" };
}
