import { useState } from "react";
import { parseSchema } from "form-engine-core";
import type { FormValues, OrgDataSource, User } from "form-engine-core";
import { Form } from "../form/Form";

/**
 * Temporary preview route for work order 03 — renders the form renderer against
 * a hardcoded schema covering all 13 field types, plus validation and
 * visibility linking. Delete once the designer (04) / filler (05) consume the
 * components for real.
 */

const PREVIEW_USERS: User[] = [
  { id: "u1", name: "张三", email: "zhangsan@example.com", departmentId: "d1", roles: ["employee"] },
  { id: "u2", name: "李四", email: "lisi@example.com", departmentId: "d1", roles: ["employee"] },
  { id: "u3", name: "王五", email: "wangwu@example.com", departmentId: "d2", roles: ["manager"] },
  { id: "u4", name: "赵六", email: "zhaoliu@example.com", departmentId: "d2", roles: ["manager"] },
];

/** In-memory org data source so UserPicker is interactive in the preview. */
const mockOrgDataSource: OrgDataSource = {
  async getUser(id) {
    return PREVIEW_USERS.find((u) => u.id === id) ?? null;
  },
  async searchUsers(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return PREVIEW_USERS.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q),
    );
  },
  async getUserManager() {
    return null;
  },
  async getUsersByDepartment(departmentId) {
    return PREVIEW_USERS.filter((u) => u.departmentId === departmentId);
  },
  async getUsersByRole(roleId) {
    return PREVIEW_USERS.filter((u) => (u.roles ?? []).includes(roleId));
  },
};

const previewSchema = parseSchema({
  schemaVersion: "1.0.0",
  sections: [
    {
      id: "basic",
      title: "基本信息",
      description: "文本、数字、选择类字段，含必填与格式校验",
      fields: [
        {
          id: "name",
          type: "text",
          label: "姓名",
          required: true,
          placeholder: "请输入姓名",
          validation: { rules: [{ type: "minLength", value: 2, message: "姓名至少 2 个字符" }] },
        },
        {
          id: "email",
          type: "text",
          label: "邮箱",
          required: true,
          placeholder: "name@example.com",
          validation: {
            rules: [{ type: "regex", value: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", message: "请输入有效的邮箱地址" }],
          },
        },
        { id: "intro", type: "textarea", label: "个人简介", required: false, placeholder: "最多 200 字", validation: { rules: [{ type: "maxLength", value: 200 }] } },
        { id: "age", type: "number", label: "年龄", required: false, validation: { rules: [{ type: "min", value: 18 }, { type: "max", value: 100 }] } },
        {
          id: "gender",
          type: "radio",
          label: "性别",
          required: false,
          options: [
            { label: "男", value: "male" },
            { label: "女", value: "female" },
            { label: "其他", value: "other" },
          ],
        },
        {
          id: "hobbies",
          type: "checkbox",
          label: "兴趣爱好",
          required: false,
          options: [
            { label: "阅读", value: "reading" },
            { label: "运动", value: "sports" },
            { label: "音乐", value: "music" },
          ],
        },
        {
          id: "city",
          type: "select",
          label: "所在城市",
          required: false,
          placeholder: "请选择",
          options: [
            { label: "北京", value: "beijing" },
            { label: "上海", value: "shanghai" },
            { label: "广州", value: "guangzhou" },
            { label: "深圳", value: "shenzhen" },
          ],
        },
        { id: "birthDate", type: "date", label: "出生日期", required: false },
        { id: "meetingTime", type: "datetime", label: "会议时间", required: false },
      ],
    },
    {
      id: "budget",
      title: "预算（跨字段校验）",
      description: "预算上限必须大于预算下限",
      fields: [
        { id: "budgetMin", type: "number", label: "预算下限", required: false },
        {
          id: "budgetMax",
          type: "number",
          label: "预算上限",
          required: false,
          validation: {
            rules: [{ type: "crossField", fieldId: "budgetMin", operator: "greaterThan", message: "预算上限必须大于预算下限" }],
          },
        },
      ],
    },
    {
      id: "linkage",
      title: "联动演示",
      description: "切换「项目类型」观察下方章节/字段的显隐",
      fields: [
        {
          id: "projectType",
          type: "select",
          label: "项目类型",
          required: false,
          options: [
            { label: "研发", value: "rd" },
            { label: "办公", value: "office" },
          ],
        },
      ],
    },
    {
      id: "rdInfo",
      title: "研发专属信息",
      visibilityCondition: { fieldId: "projectType", operator: "equals", value: "rd" },
      fields: [
        { id: "devRepo", type: "text", label: "代码仓库地址", required: false },
        { id: "teamSize", type: "number", label: "团队人数", required: false },
      ],
    },
    {
      id: "officeInfo",
      title: "办公专属信息",
      visibilityCondition: { fieldId: "projectType", operator: "equals", value: "office" },
      fields: [{ id: "officeAddress", type: "text", label: "办公地址", required: false }],
    },
    {
      id: "items",
      title: "明细清单（子表单）",
      description: "可增删行，行内字段独立校验",
      fields: [
        {
          id: "orderItems",
          type: "subform",
          label: "费用明细",
          required: false,
          subSchema: {
            fields: [
              { id: "itemName", type: "text", label: "项目名称", required: true },
              { id: "price", type: "number", label: "单价", required: false },
              { id: "quantity", type: "number", label: "数量", required: false },
            ],
          },
        },
      ],
    },
    {
      id: "attachments",
      title: "附件与人员",
      fields: [
        {
          id: "attachment",
          type: "file",
          label: "附件",
          required: false,
          helpText: "支持 PDF/PNG/JPG，单文件 ≤ 5MB，最多 3 个",
          allowTypes: ["pdf", "png", "jpg"],
          maxSizeMB: 5,
          maxCount: 3,
        },
        { id: "approver", type: "user-picker", label: "审批人（单选）", required: false, placeholder: "搜索人员" },
        { id: "team", type: "user-picker", label: "协办人（多选）", required: false, multiple: true, placeholder: "搜索人员" },
      ],
    },
    {
      id: "misc",
      title: "其他",
      fields: [
        { id: "groupHeading", type: "section", label: "分组标题（section 字段）", required: false, helpText: "MVP 中 section 字段仅作为分组标题渲染" },
        { id: "infoNote", type: "info-text", label: "提示", required: false, styleType: "info", text: "这是一条 info 样式的提示文本。" },
        { id: "warnNote", type: "info-text", label: "警告", required: false, styleType: "warning", text: "这是一条 warning 样式的警告文本。" },
        { id: "dangerNote", type: "info-text", label: "危险", required: false, styleType: "danger", text: "这是一条 danger 样式的危险提示。" },
      ],
    },
  ],
});

export const PreviewPage: React.FC = () => {
  const [submitted, setSubmitted] = useState<FormValues | null>(null);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>表单渲染器预览</h1>
      <p style={{ color: "var(--color-text-secondary)", fontSize: 14, marginBottom: 24 }}>
        工单 03 成果演示：13 种字段组件 + 实时验证 + 可见性联动 + 子表单。此页面为临时预览，接入设计器后删除。
      </p>

      <Form
        schema={previewSchema}
        orgDataSource={mockOrgDataSource}
        onSubmit={async (values) => setSubmitted(values)}
      />

      {submitted && (
        <div
          style={{
            marginTop: 24,
            background: "#fff",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            padding: 16,
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>提交结果</h3>
          <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {JSON.stringify(submitted, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
