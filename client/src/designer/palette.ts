import type { FieldType } from "form-engine-core";

/**
 * Component palette — the draggable field types in the designer's left rail.
 * The MIME type is the drag-and-drop payload for HTML5 DnD (palette → canvas).
 */

export const FIELD_TYPE_MIME = "application/x-form-field-type";
export const FIELD_REORDER_MIME = "application/x-form-field-reorder";

export interface PaletteItem {
  type: FieldType;
  label: string;
  description: string;
}

export const FIELD_PALETTE: PaletteItem[] = [
  { type: "text", label: "单行文本", description: "短文本输入" },
  { type: "textarea", label: "多行文本", description: "长文本输入" },
  { type: "number", label: "数字", description: "数值输入" },
  { type: "select", label: "下拉选择", description: "单选下拉" },
  { type: "radio", label: "单选", description: "单选项组" },
  { type: "checkbox", label: "多选", description: "多选项组" },
  { type: "date", label: "日期", description: "日期选择" },
  { type: "datetime", label: "日期时间", description: "日期 + 时间" },
  { type: "file", label: "附件上传", description: "文件上传" },
  { type: "subform", label: "子表单", description: "可增删行的表格" },
  { type: "user-picker", label: "人员选择", description: "搜索并选择用户" },
  { type: "section", label: "分组标题", description: "章节分组标题" },
  { type: "info-text", label: "说明文字", description: "信息提示文本" },
];
