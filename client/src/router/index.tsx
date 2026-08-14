import {
  createBrowserRouter,
  Navigate,
  type RouteObject,
} from "react-router-dom";
import { Shell, type NavGroup, type ShellHandle, type ShellUser } from "../layouts/Shell";
import {
  ArchiveIcon,
  BarChartIcon,
  BellIcon,
  CheckCircleIcon,
  ClockIcon,
  DatabaseIcon,
  DraftIcon,
  EyeIcon,
  FileIcon,
  LayoutIcon,
  PlusIcon,
  SendIcon,
  ShieldIcon,
  UploadIcon,
  UsersIcon,
} from "../layouts/icons";
import { PlaceholderPage } from "../pages/PlaceholderPage";
import { TemplatesPage } from "../pages/designer/TemplatesPage";
import { CreateTemplatePage } from "../pages/designer/CreateTemplatePage";
import { DesignerPage } from "../pages/designer/DesignerPage";
import { PreviewPage } from "../pages/PreviewPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { FormCenter } from "../pages/filler/FormCenter";
import { FormFillPage } from "../pages/filler/FormFillPage";
import { MyDrafts } from "../pages/filler/MyDrafts";
import { MySubmissions } from "../pages/filler/MySubmissions";

// Per-portal nav configuration (ADR-0008 / ADR-0009). One shared Shell, five
// portals, only the nav differs. Nav labels and items follow sitemap-form-engine.md;
// the designer portal mirrors the Canvas Workbench prototype (designer-templates.html).

// ── 模板设计者 /designer ────────────────────────────────────────────────────
const designerNav: NavGroup[] = [
  {
    label: "设计工作台",
    items: [
      { to: "/designer/templates", label: "我的模板", icon: <FileIcon />, count: 7 },
      { to: "/designer/create", label: "创建表单", icon: <PlusIcon /> },
      { to: "/designer/drafts", label: "草稿模板", icon: <DraftIcon />, count: 3 },
    ],
  },
  {
    label: "通用",
    items: [
      {
        to: "/notifications",
        label: "通知中心",
        icon: <BellIcon />,
        count: 2,
        countTone: "danger",
      },
    ],
  },
];

// 通用 — 每个门户侧栏末尾的通知中心（设计者另有未读计数，故单独定义）。
const commonNav: NavGroup = {
  label: "通用",
  items: [{ to: "/notifications", label: "通知中心", icon: <BellIcon /> }],
};

// ── 表单填写者 /filler ──────────────────────────────────────────────────────
const fillerNav: NavGroup[] = [
  {
    label: "表单",
    items: [
      { to: "/filler/forms", label: "表单中心", icon: <LayoutIcon /> },
      { to: "/filler/drafts", label: "我的草稿", icon: <DraftIcon /> },
      { to: "/filler/submissions", label: "我的提交", icon: <SendIcon /> },
    ],
  },
  commonNav,
];

// ── 审批人 /approver ────────────────────────────────────────────────────────
const approverNav: NavGroup[] = [
  {
    label: "审批",
    items: [
      { to: "/approver/pending", label: "待审批", icon: <ClockIcon /> },
      { to: "/approver/history", label: "已审批", icon: <CheckCircleIcon /> },
    ],
  },
  commonNav,
];

// ── 系统管理员 /admin ───────────────────────────────────────────────────────
const adminNav: NavGroup[] = [
  {
    label: "系统管理",
    items: [
      { to: "/admin/users", label: "用户管理", icon: <UsersIcon /> },
      { to: "/admin/roles", label: "角色管理", icon: <ShieldIcon /> },
      { to: "/admin/data", label: "数据管理", icon: <DatabaseIcon /> },
      { to: "/admin/statistics", label: "统计看板", icon: <BarChartIcon /> },
      { to: "/admin/templates", label: "模板管理", icon: <FileIcon /> },
    ],
  },
  commonNav,
];

// ── 运维人员 /ops ───────────────────────────────────────────────────────────
const opsNav: NavGroup[] = [
  {
    label: "运维",
    items: [
      { to: "/ops/import", label: "导入配置", icon: <UploadIcon /> },
      { to: "/ops/migrations", label: "迁移记录", icon: <ArchiveIcon /> },
      { to: "/ops/templates", label: "模板查看", icon: <EyeIcon /> },
    ],
  },
  commonNav,
];

const designerUser: ShellUser = { name: "张三", role: "设计者" };
const fillerUser: ShellUser = { name: "李四", role: "员工" };
const approverUser: ShellUser = { name: "王五", role: "审批人" };
const adminUser: ShellUser = { name: "赵六", role: "系统管理员" };
const opsUser: ShellUser = { name: "孙七", role: "运维人员" };

/**
 * The five-portal route map (ADR-0009). `/admin` is the system-admin portal,
 * the designer lives at `/designer`. Root `/` redirects to a deterministic
 * default (`/designer`, the MVP's primary surface); issue 09 makes this
 * role-based once authentication lands. Unimplemented detail pages render
 * `PlaceholderPage` until their own work orders fill them in.
 */
export const routes: RouteObject[] = [
  // ── Temporary demo route (work order 03) ──
  { path: "/preview", element: <PreviewPage /> },

  // ── Public pages (sitemap §2, no Shell) ──
  { path: "/notifications", element: <PlaceholderPage title="通知中心" /> },

  // ── Full-screen designer workbench (no Shell — mirrors the prototype's
  //    designer-edit.html, which is a standalone editor without sidebar/topbar) ──
  { path: "/designer/templates/:id", element: <DesignerPage /> },

  // ── Root: pre-auth default → designer (issue 09 → role-based) ──
  { path: "/", element: <Navigate to="/designer" replace /> },

  // ── 模板设计者门户 ──
  {
    path: "/designer",
    element: (
      <Shell
        brandName="动态表单引擎"
        brandSub="模板设计者门户"
        navGroups={designerNav}
        user={designerUser}
      />
    ),
    children: [
      { index: true, element: <Navigate to="/designer/templates" replace /> },
      {
        path: "templates",
        element: <TemplatesPage />,
        handle: { title: "我的模板", crumb: "模板设计者门户" } satisfies ShellHandle,
      },
      {
        path: "create",
        element: <CreateTemplatePage />,
        handle: { title: "创建表单", crumb: "模板设计者门户" } satisfies ShellHandle,
      },
      {
        path: "create/nl",
        element: <PlaceholderPage />,
        handle: { title: "自然语言创建", crumb: "创建表单" } satisfies ShellHandle,
      },
      {
        path: "drafts",
        element: <PlaceholderPage />,
        handle: { title: "草稿模板", crumb: "模板设计者门户" } satisfies ShellHandle,
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },

  // ── 表单填写者门户 ──
  {
    path: "/filler",
    element: (
      <Shell
        brandName="动态表单引擎"
        brandSub="表单填写者门户"
        navGroups={fillerNav}
        user={fillerUser}
      />
    ),
    children: [
      { index: true, element: <Navigate to="/filler/forms" replace /> },
      {
        path: "forms",
        element: <FormCenter />,
        handle: { title: "表单中心", crumb: "表单填写者门户" } satisfies ShellHandle,
      },
      {
        path: "instances/:id",
        element: <FormFillPage />,
        handle: { title: "填写表单", crumb: "表单填写者门户" } satisfies ShellHandle,
      },
      {
        path: "drafts",
        element: <MyDrafts />,
        handle: { title: "我的草稿", crumb: "表单填写者门户" } satisfies ShellHandle,
      },
      {
        path: "submissions",
        element: <MySubmissions />,
        handle: { title: "我的提交", crumb: "表单填写者门户" } satisfies ShellHandle,
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },

  // ── 审批人门户 ──
  {
    path: "/approver",
    element: (
      <Shell
        brandName="动态表单引擎"
        brandSub="审批人门户"
        navGroups={approverNav}
        user={approverUser}
      />
    ),
    children: [
      { index: true, element: <Navigate to="/approver/pending" replace /> },
      {
        path: "pending",
        element: <PlaceholderPage />,
        handle: { title: "待审批", crumb: "审批人门户" } satisfies ShellHandle,
      },
      {
        path: "history",
        element: <PlaceholderPage />,
        handle: { title: "已审批", crumb: "审批人门户" } satisfies ShellHandle,
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },

  // ── 系统管理员门户 ──
  {
    path: "/admin",
    element: (
      <Shell
        brandName="动态表单引擎"
        brandSub="系统管理员门户"
        navGroups={adminNav}
        user={adminUser}
      />
    ),
    children: [
      { index: true, element: <Navigate to="/admin/users" replace /> },
      {
        path: "users",
        element: <PlaceholderPage />,
        handle: { title: "用户管理", crumb: "系统管理员门户" } satisfies ShellHandle,
      },
      {
        path: "roles",
        element: <PlaceholderPage />,
        handle: { title: "角色管理", crumb: "系统管理员门户" } satisfies ShellHandle,
      },
      {
        path: "data",
        element: <PlaceholderPage />,
        handle: { title: "数据管理", crumb: "系统管理员门户" } satisfies ShellHandle,
      },
      {
        path: "statistics",
        element: <PlaceholderPage />,
        handle: { title: "统计看板", crumb: "系统管理员门户" } satisfies ShellHandle,
      },
      {
        path: "templates",
        element: <PlaceholderPage />,
        handle: { title: "模板管理", crumb: "系统管理员门户" } satisfies ShellHandle,
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },

  // ── 运维人员门户 ──
  {
    path: "/ops",
    element: (
      <Shell
        brandName="动态表单引擎"
        brandSub="运维人员门户"
        navGroups={opsNav}
        user={opsUser}
      />
    ),
    children: [
      { index: true, element: <Navigate to="/ops/import" replace /> },
      {
        path: "import",
        element: <PlaceholderPage />,
        handle: { title: "导入配置", crumb: "运维人员门户" } satisfies ShellHandle,
      },
      {
        path: "migrations",
        element: <PlaceholderPage />,
        handle: { title: "迁移记录", crumb: "运维人员门户" } satisfies ShellHandle,
      },
      {
        path: "templates",
        element: <PlaceholderPage />,
        handle: { title: "模板查看", crumb: "运维人员门户" } satisfies ShellHandle,
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },

  // ── 404 ──
  { path: "*", element: <NotFoundPage /> },
];

export const router = createBrowserRouter(routes);
