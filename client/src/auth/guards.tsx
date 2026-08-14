import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { canAccessAny, primaryPortal } from "form-engine-core";

/**
 * Route guards (work order 17; permission-driven since work order 18).
 * `RequireAuth` is the outer authenticated boundary (redirects to /login,
 * carrying the intended destination); `RequirePermission` gates a portal on
 * the user's permission codes (redirects to /403); `HomeRedirect` turns the
 * root `/` into a permission-based landing page. A user's portal access is
 * decided by `user.permissions`, never by role name.
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
 * Permission boundary — users holding none of the portal's unlock codes are
 * sent to /403. OR semantics: any one code grants access.
 */
export function RequirePermission({
  codes,
}: {
  codes: string[];
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
  return <Outlet />;
}

/** Root landing — redirect to the user's primary portal (or /login). */
export function HomeRedirect(): React.ReactElement {
  const { user, loading } = useAuth();

  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={primaryPortal(user.permissions)} replace />;
}
