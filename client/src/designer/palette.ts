import type { ComponentType, SVGProps } from "react";
import type { FieldType } from "form-engine-core";
import {
  CheckboxIcon,
  DateIcon,
  DateTimeIcon,
  FileIcon,
  NumberIcon,
  RadioIcon,
  SectionIcon,
  SelectIcon,
  TextIcon,
  TextareaIcon,
  UserIcon,
} from "./icons";

/**
 * Component palette — the draggable/clickable field types in the designer's
 * left rail. Grouped to mirror the prototype (`prototype/designer-edit.html`):
 * 布局组件 / 基础控件 / 选择控件 / 日期控件 / 高级控件.
 *
 * `"section"` is the layout container (adds a top-level section), not a field
 * type — the DesignerPage special-cases it before `createField`.
 */

export const FIELD_TYPE_MIME = "application/x-form-field-type";
export const FIELD_REORDER_MIME = "application/x-form-field-reorder";

export interface PaletteItem {
  type: FieldType;
  name: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export interface PaletteGroup {
  label: string;
  items: PaletteItem[];
}

export const PALETTE_GROUPS: PaletteGroup[] = [
  {
    label: "布局组件",
    items: [{ type: "section", name: "章节容器", icon: SectionIcon }],
  },
  {
    label: "基础控件",
    items: [
      { type: "text", name: "文本输入", icon: TextIcon },
      { type: "textarea", name: "多行文本", icon: TextareaIcon },
      { type: "number", name: "数字输入", icon: NumberIcon },
      { type: "select", name: "下拉框", icon: SelectIcon },
    ],
  },
  {
    label: "选择控件",
    items: [
      { type: "radio", name: "单选按钮", icon: RadioIcon },
      { type: "checkbox", name: "多选框", icon: CheckboxIcon },
    ],
  },
  {
    label: "日期控件",
    items: [
      { type: "date", name: "日期选择", icon: DateIcon },
      { type: "datetime", name: "日期时间", icon: DateTimeIcon },
    ],
  },
  {
    label: "高级控件",
    items: [
      { type: "file", name: "文件上传", icon: FileIcon },
      { type: "user-picker", name: "人员选择", icon: UserIcon },
    ],
  },
];
