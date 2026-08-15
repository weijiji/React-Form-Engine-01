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
import { HomeRedirect, RequireAuth, RequirePermission } from "../auth/guards";
import { AuthenticatedShell } from "../auth/AuthenticatedShell";
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

// ── Permission codes per page (ADR-0010) ────────────────────────────────────
// Every page is gated on its own codes; nav items AND route guards read this
// map, so they can never drift. Detail routes explicitly inherit their parent
// list's codes (the `:id` entries below). The five seed roles hold these exact
// code sets (server/src/db/seeds/001_seed_data.ts).

const TEMPLATE_EDIT = ["template:edit"];
const TEMPLATE_CREATE = ["template:create"];
const TEMPLATE_PUBLISH = ["template:publish"];
const TEMPLATE_IMPORT = ["template:import"];
const FORM_FILL = ["form:fill"];
const FORM_SUBMIT = ["form:submit"];
const APPROVAL_PENDING = ["approval:view_pending"];
const DATA_VIEW = ["data:view"];
const DATA_STATS = ["data:view_stats"];
const ADMIN_USERS = ["admin:manage_users"];
const ADMIN_ROLES = ["admin:manage_roles"];

export const ROUTE_CODES: Record<string, string[]> = {
  "/designer/templates": TEMPLATE_EDIT,
  "/designer/templates/:id": TEMPLATE_EDIT, // workbench inherits the list
  "/designer/create": TEMPLATE_CREATE,
  "/designer/create/nl": TEMPLATE_CREATE, // inherits /designer/create
  "/designer/drafts": TEMPLATE_EDIT,
  "/filler/forms": FORM_FILL,
  "/filler/instances/:id": FORM_FILL, // inherits /filler/forms
  "/filler/drafts": FORM_FILL,
  "/filler/submissions": FORM_SUBMIT,
  "/approver/pending": APPROVAL_PENDING,
  "/approver/history": APPROVAL_PENDING,
  "/admin/users": ADMIN_USERS,
  "/admin/roles": ADMIN_ROLES,
  "/admin/data": DATA_VIEW,
  "/admin/statistics": DATA_STATS,
  "/admin/templates": TEMPLATE_PUBLISH,
  "/ops/import": TEMPLATE_IMPORT,
  "/ops/migrations": DATA_VIEW,
  "/ops/templates": DATA_VIEW,
};

// ── One unified sidebar (ADR-0010) ─────────────────────────────────────────
// Group order drives both the display and the root landing (first accessible
// item): 系统管理 → 设计工作台 → 表单 → 审批 → 运维 → 通用. For the five seed
// roles this resolves to the same landing as before (/admin/users,
// /designer/templates, /filler/forms, /approver/pending, /ops/import).

const designerNav: NavGroup = {
  label: "设计工作台",
  items: [
    {
      to: "/designer/templates",
      label: "我的模板",
      icon: <FileIcon />,
      // count: 7,
      codes: ROUTE_CODES["/designer/templates"],
    },
    {
      to: "/designer/create",
      label: "创建模板",
      icon: <PlusIcon />,
      codes: ROUTE_CODES["/designer/create"],
    },
    {
      to: "/designer/drafts",
      label: "草稿模板",
      icon: <DraftIcon />,
      // count: 3,
      codes: ROUTE_CODES["/designer/drafts"],
    },
  ],
};

const fillerNav: NavGroup = {
  label: "表单",
  items: [
    { to: "/filler/forms", label: "表单中心", icon: <LayoutIcon />, codes: ROUTE_CODES["/filler/forms"] },
    { to: "/filler/drafts", label: "我的草稿", icon: <DraftIcon />, codes: ROUTE_CODES["/filler/drafts"] },
    { to: "/filler/submissions", label: "我的提交", icon: <SendIcon />, codes: ROUTE_CODES["/filler/submissions"] },
  ],
};

const approverNav: NavGroup = {
  label: "审批",
  items: [
    { to: "/approver/pending", label: "待审批", icon: <ClockIcon />, codes: ROUTE_CODES["/approver/pending"] },
    { to: "/approver/history", label: "已审批", icon: <CheckCircleIcon />, codes: ROUTE_CODES["/approver/history"] },
  ],
};

const adminNav: NavGroup = {
  label: "系统管理",
  items: [
    { to: "/admin/users", label: "用户管理", icon: <UsersIcon />, codes: ROUTE_CODES["/admin/users"] },
    { to: "/admin/roles", label: "角色管理", icon: <ShieldIcon />, codes: ROUTE_CODES["/admin/roles"] },
    { to: "/admin/data", label: "数据管理", icon: <DatabaseIcon />, codes: ROUTE_CODES["/admin/data"] },
    { to: "/admin/statistics", label: "统计看板", icon: <BarChartIcon />, codes: ROUTE_CODES["/admin/statistics"] },
    { to: "/admin/templates", label: "模板管理", icon: <FileIcon />, codes: ROUTE_CODES["/admin/templates"] },
  ],
};

const opsNav: NavGroup = {
  label: "运维",
  items: [
    { to: "/ops/import", label: "导入配置", icon: <UploadIcon />, codes: ROUTE_CODES["/ops/import"] },
    { to: "/ops/migrations", label: "迁移记录", icon: <ArchiveIcon />, codes: ROUTE_CODES["/ops/migrations"] },
    { to: "/ops/templates", label: "模板查看", icon: <EyeIcon />, codes: ROUTE_CODES["/ops/templates"] },
  ],
};

// No codes → always shown and always a valid landing target.
const commonNav: NavGroup = {
  label: "通用",
  items: [{ to: "/notifications", label: "通知中心", icon: <BellIcon /> }],
};

export const APP_NAV: NavGroup[] = [
  adminNav,
  designerNav,
  fillerNav,
  approverNav,
  opsNav,
  commonNav,
];

/**
 * The route map (ADR-0010). URL prefixes `/designer /filler /approver /admin
 * /ops` are pure path organization — there is no portal concept. One
 * `AuthenticatedShell` wraps every shell page with the unified
 * permission-filtered nav; each page is gated on its own codes via
 * `RequirePermission`. The root `/` lands on the first nav item the user's
 * codes unlock. The full-screen designer workbench lives outside the shell.
 * Unimplemented detail pages render `PlaceholderPage` until their work orders.
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
      // Root: permission-based landing — first unlocked nav item.
      { path: "/", element: <HomeRedirect groups={APP_NAV} /> },

      // Full-screen designer workbench — sibling of the shell subtree (no
      // sidebar/topbar). Gated on template:edit (inherited from the list).
      {
        path: "/designer/templates/:id",
        element: (
          <RequirePermission codes={ROUTE_CODES["/designer/templates/:id"]!}>
            <DesignerPage />
          </RequirePermission>
        ),
      },

      // ONE authenticated shell: one Shell, one unified permission-filtered nav.
      {
        element: <AuthenticatedShell navGroups={APP_NAV} />,
        children: [
          // ── 模板设计者 /designer ──
          { path: "/designer", element: <Navigate to="/designer/templates" replace /> },
          {
            path: "/designer/templates",
            element: (
              <RequirePermission codes={ROUTE_CODES["/designer/templates"]!}>
                <TemplatesPage />
              </RequirePermission>
            ),
            handle: { title: "我的模板", crumb: "模板设计" } satisfies ShellHandle,
          },
          {
            path: "/designer/create",
            element: (
              <RequirePermission codes={ROUTE_CODES["/designer/create"]!}>
                <CreateTemplatePage />
              </RequirePermission>
            ),
            handle: { title: "创建模板", crumb: "模板设计" } satisfies ShellHandle,
          },
          {
            path: "/designer/create/nl",
            element: (
              <RequirePermission codes={ROUTE_CODES["/designer/create/nl"]!}>
                <PlaceholderPage />
              </RequirePermission>
            ),
            handle: { title: "自然语言创建", crumb: "创建模板" } satisfies ShellHandle,
          },
          {
            path: "/designer/drafts",
            element: (
              <RequirePermission codes={ROUTE_CODES["/designer/drafts"]!}>
                <PlaceholderPage />
              </RequirePermission>
            ),
            handle: { title: "草稿模板", crumb: "模板设计" } satisfies ShellHandle,
          },

          // ── 表单填写者 /filler ──
          { path: "/filler", element: <Navigate to="/filler/forms" replace /> },
          {
            path: "/filler/forms",
            element: (
              <RequirePermission codes={ROUTE_CODES["/filler/forms"]!}>
                <FormCenter />
              </RequirePermission>
            ),
            handle: { title: "表单中心", crumb: "表单填写" } satisfies ShellHandle,
          },
          {
            path: "/filler/instances/:id",
            element: (
              <RequirePermission codes={ROUTE_CODES["/filler/instances/:id"]!}>
                <FormFillPage />
              </RequirePermission>
            ),
            handle: { title: "填写表单", crumb: "表单填写" } satisfies ShellHandle,
          },
          {
            path: "/filler/drafts",
            element: (
              <RequirePermission codes={ROUTE_CODES["/filler/drafts"]!}>
                <MyDrafts />
              </RequirePermission>
            ),
            handle: { title: "我的草稿", crumb: "表单填写" } satisfies ShellHandle,
          },
          {
            path: "/filler/submissions",
            element: (
              <RequirePermission codes={ROUTE_CODES["/filler/submissions"]!}>
                <MySubmissions />
              </RequirePermission>
            ),
            handle: { title: "我的提交", crumb: "表单填写" } satisfies ShellHandle,
          },

          // ── 审批人 /approver ──
          { path: "/approver", element: <Navigate to="/approver/pending" replace /> },
          {
            path: "/approver/pending",
            element: (
              <RequirePermission codes={ROUTE_CODES["/approver/pending"]!}>
                <PlaceholderPage />
              </RequirePermission>
            ),
            handle: { title: "待审批", crumb: "审批" } satisfies ShellHandle,
          },
          {
            path: "/approver/history",
            element: (
              <RequirePermission codes={ROUTE_CODES["/approver/history"]!}>
                <PlaceholderPage />
              </RequirePermission>
            ),
            handle: { title: "已审批", crumb: "审批" } satisfies ShellHandle,
          },

          // ── 系统管理员 /admin ──
          { path: "/admin", element: <Navigate to="/admin/users" replace /> },
          {
            path: "/admin/users",
            element: (
              <RequirePermission codes={ROUTE_CODES["/admin/users"]!}>
                <UsersPage />
              </RequirePermission>
            ),
            handle: { title: "用户管理", crumb: "系统管理" } satisfies ShellHandle,
          },
          {
            path: "/admin/roles",
            element: (
              <RequirePermission codes={ROUTE_CODES["/admin/roles"]!}>
                <RolesPage />
              </RequirePermission>
            ),
            handle: { title: "角色管理", crumb: "系统管理" } satisfies ShellHandle,
          },
          {
            path: "/admin/data",
            element: (
              <RequirePermission codes={ROUTE_CODES["/admin/data"]!}>
                <PlaceholderPage />
              </RequirePermission>
            ),
            handle: { title: "数据管理", crumb: "系统管理" } satisfies ShellHandle,
          },
          {
            path: "/admin/statistics",
            element: (
              <RequirePermission codes={ROUTE_CODES["/admin/statistics"]!}>
                <PlaceholderPage />
              </RequirePermission>
            ),
            handle: { title: "统计看板", crumb: "系统管理" } satisfies ShellHandle,
          },
          {
            path: "/admin/templates",
            element: (
              <RequirePermission codes={ROUTE_CODES["/admin/templates"]!}>
                <PlaceholderPage />
              </RequirePermission>
            ),
            handle: { title: "模板管理", crumb: "系统管理" } satisfies ShellHandle,
          },

          // ── 运维人员 /ops ──
          { path: "/ops", element: <Navigate to="/ops/import" replace /> },
          {
            path: "/ops/import",
            element: (
              <RequirePermission codes={ROUTE_CODES["/ops/import"]!}>
                <PlaceholderPage />
              </RequirePermission>
            ),
            handle: { title: "导入配置", crumb: "运维" } satisfies ShellHandle,
          },
          {
            path: "/ops/migrations",
            element: (
              <RequirePermission codes={ROUTE_CODES["/ops/migrations"]!}>
                <PlaceholderPage />
              </RequirePermission>
            ),
            handle: { title: "迁移记录", crumb: "运维" } satisfies ShellHandle,
          },
          {
            path: "/ops/templates",
            element: (
              <RequirePermission codes={ROUTE_CODES["/ops/templates"]!}>
                <PlaceholderPage />
              </RequirePermission>
            ),
            handle: { title: "模板查看", crumb: "运维" } satisfies ShellHandle,
          },

          // In-shell 404 for any other authenticated path.
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },

  // ── 404 ──
  { path: "*", element: <NotFoundPage /> },
];

export const router = createBrowserRouter(routes);
