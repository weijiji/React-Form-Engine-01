import type { Knex } from "knex";
import crypto from "crypto";

// Simple password hashing for seeds (SHA-256 with salt)
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 10000, 64, "sha512")
    .toString("hex");
  return `${salt}:${hash}`;
}

export async function seed(knex: Knex): Promise<void> {
  // Truncate all tables in dependency order
  await knex("audit_logs").del();
  await knex("idempotency_keys").del();
  await knex("notifications").del();
  await knex("drafts").del();
  await knex("approval_records").del();
  await knex("form_instances").del();
  await knex("form_templates").del();
  await knex("roles_permissions").del();
  await knex("users_roles").del();
  await knex("permissions").del();
  await knex("roles").del();
  await knex("users").del();

  // ── Users ───────────────────────────────────────────────────
  const adminPassword = hashPassword("admin123");
  const userPassword = hashPassword("user123");

  const [admin] = await knex("users")
    .insert([
      {
        name: "系统管理员",
        email: "admin@example.com",
        password_hash: adminPassword,
        department_id: null,
        manager_id: null,
        is_active: true,
      },
    ])
    .returning("id");

  // Insert Zhang San first (no manager)
  const [zhangsan] = await knex("users")
    .insert([
      {
        name: "张三",
        email: "zhangsan@example.com",
        password_hash: userPassword,
        department_id: null,
        manager_id: null,
        is_active: true,
      },
    ])
    .returning("id");

  // Insert Li Si and Wang Wu (both report to Zhang San)
  const subordinates = await knex("users")
    .insert([
      {
        name: "李四",
        email: "lisi@example.com",
        password_hash: userPassword,
        department_id: null,
        manager_id: zhangsan.id, // 李四的直属上级是张三
        is_active: true,
      },
      {
        name: "王五",
        email: "wangwu@example.com",
        password_hash: userPassword,
        department_id: null,
        manager_id: zhangsan.id, // 王五的直属上级也是张三
        is_active: true,
      },
    ])
    .returning("id");

  const users = [zhangsan, ...subordinates];
  // admin.id, zhangsan.id, lisi.id, wangwu.id

  // ── Permissions ─────────────────────────────────────────────
  const permissionCodes = [
    // 设计器
    { code: "template:create", name: "创建模板", category: "设计器" },
    { code: "template:edit", name: "编辑模板", category: "设计器" },
    { code: "template:delete", name: "删除模板", category: "设计器" },
    { code: "template:publish", name: "发布模板", category: "设计器" },
    { code: "template:export", name: "导出配置", category: "设计器" },
    { code: "template:import", name: "导入配置", category: "设计器" },
    { code: "template:force_unlock", name: "强制解锁", category: "设计器" },
    // 填写器
    { code: "form:fill", name: "填写表单", category: "填写器" },
    { code: "form:submit", name: "提交表单", category: "填写器" },
    { code: "form:withdraw", name: "撤回提交", category: "填写器" },
    // 审批
    { code: "approval:view_pending", name: "查看待审批", category: "审批" },
    { code: "approval:approve", name: "审批同意", category: "审批" },
    { code: "approval:reject", name: "审批拒绝", category: "审批" },
    { code: "approval:return", name: "退回修改", category: "审批" },
    { code: "approval:transfer", name: "转交审批", category: "审批" },
    // 数据管理
    { code: "data:view", name: "查看数据", category: "数据管理" },
    { code: "data:export", name: "导出数据", category: "数据管理" },
    { code: "data:view_stats", name: "查看统计", category: "数据管理" },
    // 管理
    { code: "admin:manage_roles", name: "管理角色", category: "管理" },
    { code: "admin:manage_users", name: "管理用户", category: "管理" },
  ];

  const permissions = await knex("permissions")
    .insert(permissionCodes)
    .returning("id");

  // ── Roles ───────────────────────────────────────────────────
  const [adminRole] = await knex("roles")
    .insert([
      {
        name: "管理员",
        description: "系统管理员，拥有全部权限",
      },
    ])
    .returning("id");

  const [userRole] = await knex("roles")
    .insert([
      {
        name: "普通用户",
        description: "普通用户，可填写和提交表单",
      },
    ])
    .returning("id");

  // ── Assign all permissions to admin role ────────────────────
  await knex("roles_permissions").insert(
    permissions.map((p) => ({
      role_id: adminRole.id,
      permission_id: p.id,
    }))
  );

  // ── Assign basic permissions to user role ───────────────────
  const userPermissionCodes = [
    "form:fill",
    "form:submit",
    "form:withdraw",
    "approval:view_pending",
    "approval:approve",
    "approval:reject",
    "approval:return",
    "approval:transfer",
    "data:view",
  ];
  const userPermissions = await knex("permissions")
    .whereIn("code", userPermissionCodes)
    .select("id");

  await knex("roles_permissions").insert(
    userPermissions.map((p) => ({
      role_id: userRole.id,
      permission_id: p.id,
    }))
  );

  // ── Assign roles to users ───────────────────────────────────
  // Admin gets admin role
  await knex("users_roles").insert({
    user_id: admin.id,
    role_id: adminRole.id,
  });

  // All 3 regular users get user role
  for (const user of users) {
    await knex("users_roles").insert({
      user_id: user.id,
      role_id: userRole.id,
    });
  }

  // ── Sample Form Template ────────────────────────────────────
  const sampleSchema = {
    schemaVersion: "1.0.0",
    sections: [
      {
        id: "sec-001",
        title: "基本信息",
        description: "请填写IT设备申领的基本信息",
        collapsible: false,
        defaultCollapsed: false,
        visibilityCondition: null,
        fields: [
          {
            id: "fld-001",
            type: "text",
            label: "申领人",
            required: true,
            placeholder: "请输入您的姓名",
            defaultValue: "",
            helpText: "",
            validation: {
              rules: [
                { type: "required", message: "请输入申领人姓名" },
                { type: "minLength", value: 2, message: "姓名至少2个字符" },
                { type: "maxLength", value: 50, message: "姓名不超过50个字符" },
              ],
            },
            visibilityCondition: null,
          },
          {
            id: "fld-002",
            type: "select",
            label: "设备类型",
            required: true,
            placeholder: "请选择设备类型",
            options: [
              { label: "笔记本电脑", value: "laptop" },
              { label: "台式机", value: "desktop" },
              { label: "显示器", value: "monitor" },
              { label: "打印机", value: "printer" },
              { label: "其他", value: "other" },
            ],
            validation: {
              rules: [{ type: "required", message: "请选择设备类型" }],
            },
            visibilityCondition: null,
          },
          {
            id: "fld-003",
            type: "number",
            label: "申领数量",
            required: true,
            placeholder: "请输入数量",
            defaultValue: 1,
            validation: {
              rules: [
                { type: "required", message: "请输入申领数量" },
                { type: "min", value: 1, message: "数量不能少于1" },
                { type: "max", value: 100, message: "数量不能超过100" },
              ],
            },
            visibilityCondition: null,
          },
        ],
      },
      {
        id: "sec-002",
        title: "申领原因",
        description: "请详细说明申领原因",
        collapsible: true,
        defaultCollapsed: false,
        visibilityCondition: null,
        fields: [
          {
            id: "fld-004",
            type: "textarea",
            label: "申领理由",
            required: true,
            placeholder: "请详细说明申领该设备的理由...",
            defaultValue: "",
            validation: {
              rules: [
                { type: "required", message: "请填写申领理由" },
                { type: "minLength", value: 10, message: "申领理由至少10个字符" },
                { type: "maxLength", value: 500, message: "申领理由不超过500个字符" },
              ],
            },
            visibilityCondition: null,
          },
          {
            id: "fld-005",
            type: "select",
            label: "紧急程度",
            required: true,
            placeholder: "请选择紧急程度",
            options: [
              { label: "普通", value: "normal" },
              { label: "紧急", value: "urgent" },
              { label: "特急", value: "critical" },
            ],
            defaultValue: "normal",
            validation: {
              rules: [{ type: "required", message: "请选择紧急程度" }],
            },
            visibilityCondition: null,
          },
        ],
      },
      {
        id: "sec-003",
        title: "设备规格",
        description: "如需特定规格请填写（选填）",
        collapsible: true,
        defaultCollapsed: true,
        visibilityCondition: {
          type: "AndCondition",
          conditions: [
            {
              type: "LeafCondition",
              fieldId: "fld-002",
              operator: "in",
              value: ["laptop", "desktop"],
            },
          ],
        },
        fields: [
          {
            id: "fld-006",
            type: "text",
            label: "CPU 要求",
            required: false,
            placeholder: "如：i7 或以上",
            defaultValue: "",
            validation: {
              rules: [],
            },
            visibilityCondition: null,
          },
          {
            id: "fld-007",
            type: "text",
            label: "内存要求",
            required: false,
            placeholder: "如：16GB 或以上",
            defaultValue: "",
            validation: {
              rules: [],
            },
            visibilityCondition: null,
          },
        ],
      },
    ],
  };

  const sampleApprovalChain = {
    nodes: [
      {
        id: "node-001",
        order: 1,
        label: "直属上级审批",
        approverRule: {
          type: "org_structure",
          relation: "direct_manager",
        },
      },
      {
        id: "node-002",
        order: 2,
        label: "IT部门审批",
        approverRule: {
          type: "role",
          roleId: "role-it-dept",
        },
      },
    ],
  };

  await knex("form_templates").insert({
    name: "IT设备申领表",
    description:
      "用于申领笔记本电脑、台式机、显示器、打印机等IT设备。提交后将依次经过直属上级和IT部门审批。",
    category: "IT管理",
    version: 1,
    schema: JSON.stringify(sampleSchema),
    approval_chain: JSON.stringify(sampleApprovalChain),
    status: "published",
    locked_by: null,
    locked_at: null,
    created_by: admin.id,
  });

  console.log("Seed completed successfully.");
  console.log(`  - Admin: admin@example.com / admin123`);
  console.log(`  - Users: zhangsan@example.com, lisi@example.com, wangwu@example.com / user123`);
  console.log(`  - 1 sample template: "IT设备申领表" (published)`);
}
