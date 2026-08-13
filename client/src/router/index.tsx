import {
  createBrowserRouter,
  Navigate,
  type RouteObject,
} from "react-router-dom";
import { Shell, type NavGroup, type ShellUser } from "../layouts/Shell";
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
import { PreviewPage } from "../pages/PreviewPage";
import { NotFoundPage } from "../pages/NotFoundPage";

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
        topbarCrumb="模板设计者门户"
        topbarTitle="我的模板"
        user={designerUser}
      />
    ),
    children: [
      { index: true, element: <Navigate to="/designer/templates" replace /> },
      { path: "templates", element: <TemplatesPage /> },
      { path: "create", element: <PlaceholderPage title="创建表单" /> },
      { path: "drafts", element: <PlaceholderPage title="草稿模板" /> },
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
        topbarCrumb="表单填写者门户"
        topbarTitle="表单中心"
        user={fillerUser}
      />
    ),
    children: [
      { index: true, element: <Navigate to="/filler/forms" replace /> },
      { path: "forms", element: <PlaceholderPage title="表单中心" /> },
      { path: "drafts", element: <PlaceholderPage title="我的草稿" /> },
      { path: "submissions", element: <PlaceholderPage title="我的提交" /> },
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
        topbarCrumb="审批人门户"
        topbarTitle="待审批"
        user={approverUser}
      />
    ),
    children: [
      { index: true, element: <Navigate to="/approver/pending" replace /> },
      { path: "pending", element: <PlaceholderPage title="待审批" /> },
      { path: "history", element: <PlaceholderPage title="已审批" /> },
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
        topbarCrumb="系统管理员门户"
        topbarTitle="用户管理"
        user={adminUser}
      />
    ),
    children: [
      { index: true, element: <Navigate to="/admin/users" replace /> },
      { path: "users", element: <PlaceholderPage title="用户管理" /> },
      { path: "roles", element: <PlaceholderPage title="角色管理" /> },
      { path: "data", element: <PlaceholderPage title="数据管理" /> },
      { path: "statistics", element: <PlaceholderPage title="统计看板" /> },
      { path: "templates", element: <PlaceholderPage title="模板管理" /> },
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
        topbarCrumb="运维人员门户"
        topbarTitle="导入配置"
        user={opsUser}
      />
    ),
    children: [
      { index: true, element: <Navigate to="/ops/import" replace /> },
      { path: "import", element: <PlaceholderPage title="导入配置" /> },
      { path: "migrations", element: <PlaceholderPage title="迁移记录" /> },
      { path: "templates", element: <PlaceholderPage title="模板查看" /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },

  // ── 404 ──
  { path: "*", element: <NotFoundPage /> },
];

export const router = createBrowserRouter(routes);
