/* ============================================================
   动态表单引擎 · 设计器 & 公共页面原型 (v08) — 共享脚本
   ============================================================ */
(function () {
  "use strict";

  /* ---------- 小工具 ---------- */
  window.$ = function (sel, root) {
    return (root || document).querySelector(sel);
  };
  window.$$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };
  window.esc = function (s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  };
  window.toast = function (msg, kind) {
    var root = $("#toast-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "toast-root";
      document.body.appendChild(root);
    }
    var t = document.createElement("div");
    t.className = "toast" + (kind ? " " + kind : "");
    var ico =
      kind === "ok"
        ? '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
        : kind === "err"
          ? '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>'
          : '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';
    t.innerHTML = ico + "<span>" + esc(msg) + "</span>";
    root.appendChild(t);
    setTimeout(function () {
      t.style.transition = "opacity .3s";
      t.style.opacity = "0";
      setTimeout(function () {
        t.remove();
      }, 300);
    }, 2600);
  };

  /* 当前用户（原型模拟：管理员 / 模板设计者） */
  window.CURRENT_USER = {
    name: "李晨",
    role: "模板设计者",
    initials: "LC",
  };

  /* ---------- 共享 mock 数据 ---------- */
  window.DB = {
    /* 分类 */
    categories: ["通用", "人力资源", "行政", "财务", "采购", "IT"],

    /* 模板 */
    templates: [
      {
        id: "tpl-001",
        name: "员工入职信息登记表",
        desc: "用于新员工入职时采集基本信息、联系方式和职位信息，支持附件上传与紧急联系人登记。",
        category: "人力资源",
        status: "published", // published | draft
        fields: 9,
        updated: "2026-08-06 14:32",
        created: "2026-07-18",
        version: "v1.2",
        checkedOutBy: null,
        owner: "李晨",
      },
      {
        id: "tpl-002",
        name: "日常请假申请单",
        desc: "请假类型、起止时间与事由说明，审批链为直属上级 → 部门负责人。",
        category: "人力资源",
        status: "published",
        fields: 6,
        updated: "2026-08-03 09:12",
        created: "2026-07-22",
        version: "v1.0",
        checkedOutBy: null,
        owner: "李晨",
      },
      {
        id: "tpl-003",
        name: "办公用品采购申请表",
        desc: "采购物品清单、预算与用途说明，审批链为直属上级 → 财务审批。",
        category: "采购",
        status: "published",
        fields: 8,
        updated: "2026-07-29 17:45",
        created: "2026-07-29",
        version: "v1.1",
        checkedOutBy: null,
        owner: "李晨",
      },
      {
        id: "tpl-004",
        name: "差旅费用报销单",
        desc: "报销明细、发票附件与费用汇总，支持多行明细录入。",
        category: "财务",
        status: "published",
        fields: 12,
        updated: "2026-07-25 11:20",
        created: "2026-07-20",
        version: "v1.0",
        checkedOutBy: null,
        owner: "李晨",
      },
      {
        id: "tpl-005",
        name: "会议室预订申请表",
        desc: "会议室选择、时段与参会人数，用于行政统一管理会议室资源。",
        category: "行政",
        status: "draft",
        fields: 5,
        updated: "2026-08-07 16:08",
        created: "2026-08-07",
        version: "v0.1",
        checkedOutBy: null,
        owner: "李晨",
      },
      {
        id: "tpl-006",
        name: "IT 设备领用登记",
        desc: "登记设备类型、领用人、用途与归还日期，草稿阶段（尚未发布）。",
        category: "IT",
        status: "draft",
        fields: 7,
        updated: "2026-08-05 10:30",
        created: "2026-08-02",
        version: "v0.3",
        checkedOutBy: null,
        owner: "李晨",
      },
      {
        id: "tpl-007",
        name: "客户拜访计划表",
        desc: "拜访客户、日期、目的与预期成果，草稿阶段。",
        category: "通用",
        status: "draft",
        fields: 4,
        updated: "2026-08-01 13:55",
        created: "2026-07-30",
        version: "v0.1",
        checkedOutBy: null,
        owner: "李晨",
      },
    ],

    /* 模板详情（只读演示用） */
    templateDetail: {
      id: "tpl-001",
      name: "员工入职信息登记表",
      desc: "用于新员工入职时采集基本信息、联系方式和职位信息，支持附件上传与紧急联系人登记。",
      category: "人力资源",
      status: "published",
      version: "v1.2",
      updated: "2026-08-06 14:32",
      created: "2026-07-18",
      owner: "李晨",
      fields: 9,
      submissions: 128,
      checkedOutBy: "王芳", // 他人签出演示
      schema: {
        sections: [
          {
            id: "sec-1",
            title: "基本信息",
            fields: [
              { id: "f-1", name: "姓名", type: "text", required: true },
              { id: "f-2", name: "工号", type: "number", required: true },
              { id: "f-3", name: "入职日期", type: "date", required: true },
            ],
          },
          {
            id: "sec-2",
            title: "联系方式",
            fields: [
              { id: "f-4", name: "手机号码", type: "text", required: true },
              { id: "f-5", name: "电子邮箱", type: "text", required: true },
            ],
          },
          {
            id: "sec-3",
            title: "职位信息",
            fields: [
              { id: "f-6", name: "所属部门", type: "select", required: true },
              { id: "f-7", name: "岗位名称", type: "text", required: true },
              { id: "f-8", name: "试用期（月）", type: "number", required: false },
            ],
          },
        ],
      },
    },

    /* 草稿（继续编辑） */
    drafts: [
      {
        id: "tpl-005",
        name: "会议室预订申请表",
        desc: "会议室选择、时段与参会人数。",
        category: "行政",
        fields: 5,
        updated: "2026-08-07 16:08",
        lastEdit: "完成第 3 个字段配置",
      },
      {
        id: "tpl-006",
        name: "IT 设备领用登记",
        desc: "登记设备类型、领用人、用途与归还日期。",
        category: "IT",
        fields: 7,
        updated: "2026-08-05 10:30",
        lastEdit: "已配置验证规则",
      },
      {
        id: "tpl-007",
        name: "客户拜访计划表",
        desc: "拜访客户、日期、目的与预期成果。",
        category: "通用",
        fields: 4,
        updated: "2026-08-01 13:55",
        lastEdit: "已创建空白模板",
      },
    ],

    /* 通知 */
    notifications: [
      {
        id: "n1",
        type: "approval",
        title: "审批全部完成",
        text: "《员工入职信息登记表》的审批流程已全部完成，提交人：陈静。",
        time: "8 分钟前",
        unread: true,
        to: "/filler/submissions/s-1001",
      },
      {
        id: "n2",
        type: "checkout",
        title: "模板被他人签出",
        text: "王芳 正在编辑《员工入职信息登记表》，已加编辑锁，暂不可修改。",
        time: "26 分钟前",
        unread: true,
        to: "/designer/templates/tpl-001",
      },
      {
        id: "n3",
        type: "system",
        title: "模板导入成功",
        text: "《员工入职信息登记表》v1.2 已成功导入至生产环境（PROD）。",
        time: "昨天 18:20",
        unread: false,
        to: "/ops/migrations/m-1",
      },
      {
        id: "n4",
        type: "submit",
        title: "新提交",
        text: "周婷 提交了《办公用品采购申请表》，等待直属上级审批。",
        time: "昨天 15:04",
        unread: false,
        to: "/filler/forms/f-003/track",
      },
      {
        id: "n5",
        type: "draft",
        title: "草稿自动保存",
        text: "《会议室预订申请表》的草稿已在 3 天前自动保存，可继续编辑。",
        time: "3 天前",
        unread: false,
        to: "/designer/drafts",
      },
      {
        id: "n6",
        type: "system",
        title: "系统维护通知",
        text: "本周六 02:00 - 04:00 将进行系统升级维护，期间表单填写与审批可能短暂不可用。",
        time: "5 天前",
        unread: false,
        to: "/notifications",
      },
    ],

    /* 导出模板 */
    exportTarget: {
      id: "tpl-001",
      name: "员工入职信息登记表",
      version: "v1.2",
      category: "人力资源",
      status: "published",
      fields: 9,
      updated: "2026-08-06 14:32",
      checks: [
        { ok: true, title: "模板已签入", desc: "当前无编辑锁，模板处于签入状态" },
        { ok: true, title: "字段数量 ≥ 1", desc: "共 9 个字段，满足导出条件" },
        { ok: true, title: "JSON 配置完整", desc: "结构、验证与联动配置均可序列化" },
        { ok: false, title: "审批链包含审批人", desc: "节点「财务审批」未配置审批人规则" },
      ],
    },
  };

  /* ---------- 通知图标映射 ---------- */
  window.NOTIF_ICONS = {
    approval:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>',
    checkout:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    system:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    submit:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>',
    draft:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5z"/><path d="M15 3v5h5"/><path d="M8 13h8M8 17h5"/></svg>',
  };
  window.NOTIF_COLORS = {
    approval: "success",
    checkout: "amber",
    system: "blue",
    submit: "indigo",
    draft: "gray",
  };

  /* ---------- 侧边栏高亮 ---------- */
  window.setNavActive = function (hrefPart) {
    $$(".nav-item").forEach(function (it) {
      it.classList.toggle("active", (it.getAttribute("href") || "").indexOf(hrefPart) === 0);
    });
  };

  /* 填充用户信息 */
  window.fillUser = function () {
    var u = window.CURRENT_USER;
    $$(".user-chip .u-name").forEach(function (el) {
      el.textContent = u.name;
    });
    $$(".user-chip .u-role").forEach(function (el) {
      el.textContent = u.role;
    });
    $$(".avatar").forEach(function (el) {
      el.textContent = u.initials;
    });
  };

  document.addEventListener("DOMContentLoaded", function () {
    window.fillUser && window.fillUser();
  });
})();
