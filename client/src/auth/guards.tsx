import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { NavGroup } from "../layouts/Shell";
import { canAccessAny, firstAccessiblePath } from "./permissions";
import { useAuth } from "./AuthContext";

/**
 * Route guards (work orders 17/18; permission-driven since ADR-0010).
 * `RequireAuth` is the outer authenticated boundary (redirects to /login,
 * carrying the intended destination); `RequirePermission` gates a page on the
 * permission codes it requires (redirects to /403); `HomeRedirect` turns the
 * root `/` into a landing page that resolves to the first nav item the user's
 * codes unlock. Access is decided by `user.permissions`, never by role name or
 * portal membership.
 */

function Loading(): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        padding: "80px 20px",
        color: "var(--text-3)",
      }}
      role="status"
    >
      加载中…
    </div>
  );
}

/** Authenticated boundary — signed-out users are sent to /login. */
export function RequireAuth(): React.ReactElement {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loading />;
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  return <Outlet />;
}

/**
 * Page permission boundary — users holding none of the page's required codes
 * are sent to /403. OR semantics: any one code grants access. Wraps the page
 * component directly (page-level gating, ADR-0010); no longer an Outlet layout.
 */
export function RequirePermission({
  codes,
  children,
}: {
  codes: string[];
  children: React.ReactNode;
}): React.ReactElement {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loading />;
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  if (!canAccessAny(codes, user.permissions)) {
    return <Navigate to="/403" replace />;
  }
  return <>{children}</>;
}

/**
 * Root landing — redirect to the first nav item the user's permission codes
 * unlock (or /login). The router passes the unified `APP_NAV` as `groups`.
 */
export function HomeRedirect({
  groups,
}: {
  groups: NavGroup[];
}): React.ReactElement {
  const { user, loading } = useAuth();

  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={firstAccessiblePath(groups, user.permissions) ?? "/403"} replace />;
}
