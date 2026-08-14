import {
  createBrowserRouter,
  Navigate,
  type RouteObject,
} from "react-router-dom";
import type { NavGroup, ShellHandle } from "../layouts/Shell";
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
import { HomeRedirect, RequireAuth, RequireRole } from "../auth/guards";
import { PortalShell } from "../auth/PortalShell";
import { PlaceholderPage } from "../pages/PlaceholderPage";
import { LoginPage } from "../pages/LoginPage";
import { ForbiddenPage } from "../pages/ForbiddenPage";
import { TemplatesPage } from "../pages/designer/TemplatesPage";
import { CreateTemplatePage } from "../pages/designer/CreateTemplatePage";
import { DesignerPage } from "../pages/designer/DesignerPage";
import { PreviewPage } from "../pages/PreviewPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { FormCenter } from "../pages/filler/FormCenter";
import { FormFillPage } from "../pages/filler/FormFillPage";
import { MyDrafts } from "../pages/filler/MyDrafts";
import { MySubmissions } from "../pages/filler/MySubmissions";
import { RolesPage } from "../pages/admin/RolesPage";
import { UsersPage } from "../pages/admin/UsersPage";

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

/**
 * The five-portal route map (ADR-0009). Work order 17 wires authentication:
 * `RequireAuth` is the outer boundary, each portal is gated by `RequireRole`
 * (its fixed role), and the root `/` redirects to the signed-in user's primary
 * portal via `HomeRedirect`. Unimplemented detail pages render `PlaceholderPage`
 * until their own work orders fill them in.
 */
export const routes: RouteObject[] = [
  // ── Temporary demo route (work order 03) ──
  { path: "/preview", element: <PreviewPage /> },

  // ── Public pages (no auth) ──
  { path: "/notifications", element: <PlaceholderPage title="通知中心" /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/403", element: <ForbiddenPage /> },

  // ── Authenticated area (work order 17) ──
  {
    element: <RequireAuth />,
    children: [
      // Root: role-based landing page
      { path: "/", element: <HomeRedirect /> },

      // ── 模板设计者门户 ──
      {
        element: <RequireRole roles={["设计者"]} />,
        children: [
          // Full-screen designer workbench (no Shell — mirrors the prototype's
          // designer-edit.html, a standalone editor without sidebar/topbar).
          { path: "/designer/templates/:id", element: <DesignerPage /> },
          {
            path: "/designer",
            element: (
              <PortalShell brandSub="模板设计者门户" navGroups={designerNav} />
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
        ],
      },

      // ── 表单填写者门户 ──
      {
        element: <RequireRole roles={["填写者"]} />,
        children: [
          {
            path: "/filler",
            element: (
              <PortalShell brandSub="表单填写者门户" navGroups={fillerNav} />
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
        ],
      },

      // ── 审批人门户 ──
      {
        element: <RequireRole roles={["审批者"]} />,
        children: [
          {
            path: "/approver",
            element: (
              <PortalShell brandSub="审批人门户" navGroups={approverNav} />
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
        ],
      },

      // ── 系统管理员门户 ──
      {
        element: <RequireRole roles={["管理员"]} />,
        children: [
          {
            path: "/admin",
            element: (
              <PortalShell brandSub="系统管理员门户" navGroups={adminNav} />
            ),
            children: [
              { index: true, element: <Navigate to="/admin/users" replace /> },
              {
                path: "users",
                element: <UsersPage />,
                handle: { title: "用户管理", crumb: "系统管理员门户" } satisfies ShellHandle,
              },
              {
                path: "roles",
                element: <RolesPage />,
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
        ],
      },

      // ── 运维人员门户 ──
      {
        element: <RequireRole roles={["运维"]} />,
        children: [
          {
            path: "/ops",
            element: (
              <PortalShell brandSub="运维人员门户" navGroups={opsNav} />
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
        ],
      },
    ],
  },

  // ── 404 ──
  { path: "*", element: <NotFoundPage /> },
];

export const router = createBrowserRouter(routes);
