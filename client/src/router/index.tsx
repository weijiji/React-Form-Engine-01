import {
  createBrowserRouter,
  Navigate,
} from "react-router-dom";
import { Shell, type NavGroup, type ShellUser } from "../layouts/Shell";
import {
  BellIcon,
  DraftIcon,
  FileIcon,
  PlusIcon,
} from "../layouts/icons";
import { HomePage } from "../pages/HomePage";
import { TemplatesPage } from "../pages/admin/TemplatesPage";
import { PreviewPage } from "../pages/PreviewPage";
import { NotFoundPage } from "../pages/NotFoundPage";

// Per-portal nav configuration (ADR-0008). The shell is shared; only the nav
// differs. Full five-portal split lands in work order 16. The designer nav
// mirrors the prototype's designer portal (我的模板 / 创建表单 / 草稿模板 +
// 通用 / 通知中心); 创建表单 and 草稿模板 pages land with later work orders.
const designerNav: NavGroup[] = [
  {
    label: "设计工作台",
    items: [
      { to: "/admin/templates", label: "我的模板", icon: <FileIcon />, count: 7 },
      { to: "/admin/templates/new", label: "创建表单", icon: <PlusIcon /> },
      { to: "/admin/drafts", label: "草稿模板", icon: <DraftIcon />, count: 3 },
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

const fillerNav: NavGroup[] = [
  {
    label: "表单",
    items: [
      { to: "/forms", label: "表单中心" },
      { to: "/drafts", label: "草稿箱" },
      { to: "/submissions", label: "我的提交" },
      { to: "/approvals", label: "待审批" },
      { to: "/notifications", label: "通知" },
    ],
  },
];

const designerUser: ShellUser = { name: "张三", role: "设计者" };
const fillerUser: ShellUser = { name: "李四", role: "员工" };

export const router = createBrowserRouter([
  // ── Temporary demo route (work order 03) ──
  { path: "/preview", element: <PreviewPage /> },

  // ── Admin (Designer) routes ──
  {
    path: "/admin",
    element: (
      <Shell
        brandName="动态表单引擎"
        brandSub="模板设计者门户"
        navGroups={designerNav}
        topbarTitle="设计器"
        user={designerUser}
      />
    ),
    children: [
      { index: true, element: <Navigate to="/admin/templates" replace /> },
      { path: "templates", element: <TemplatesPage /> },
      // Future routes:
      // /admin/templates/new
      // /admin/templates/:id/design
      // /admin/templates/:id/preview
      // /admin/import
      // /admin/roles
      { path: "*", element: <NotFoundPage /> },
    ],
  },

  // ── Filler (User) routes ──
  {
    path: "/",
    element: (
      <Shell
        brandName="动态表单引擎"
        brandSub="表单填写者门户"
        navGroups={fillerNav}
        topbarTitle="表单中心"
        user={fillerUser}
      />
    ),
    children: [
      { index: true, element: <HomePage /> },
      // Future routes:
      // /forms
      // /forms/:templateId/fill
      // /drafts
      // /drafts/:id/edit
      // /submissions
      // /submissions/:id
      // /approvals
      // /approvals/:id
      // /data
      // /data/:instanceId
      // /stats
      // /notifications
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
