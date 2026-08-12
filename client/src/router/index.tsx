import {
  createBrowserRouter,
  Navigate,
} from "react-router-dom";
import { AdminLayout } from "../layouts/AdminLayout";
import { UserLayout } from "../layouts/UserLayout";
import { HomePage } from "../pages/HomePage";
import { TemplatesPage } from "../pages/admin/TemplatesPage";
import { PreviewPage } from "../pages/PreviewPage";
import { NotFoundPage } from "../pages/NotFoundPage";

export const router = createBrowserRouter([
  // ── Temporary demo route (work order 03) ──
  { path: "/preview", element: <PreviewPage /> },

  // ── Admin (Designer) routes ──
  {
    path: "/admin",
    element: <AdminLayout />,
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
    element: <UserLayout />,
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
