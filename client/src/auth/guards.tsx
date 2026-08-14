import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { hasAnyRole, primaryPortal } from "./roles";

/**
 * Route guards (work order 17). `RequireAuth` is the outer authenticated
 * boundary (redirects to /login, carrying the intended destination);
 * `RequireRole` gates a portal on role membership (redirects to /403);
 * `HomeRedirect` turns the root `/` into a role-based landing page.
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

function roleNames(user: { roles: { name: string }[] }): string[] {
  return user.roles.map((r) => r.name);
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

/** Role boundary — users missing every allowed role are sent to /403. */
export function RequireRole({ roles }: { roles: string[] }): React.ReactElement {
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
  if (!hasAnyRole(roleNames(user), roles)) {
    return <Navigate to="/403" replace />;
  }
  return <Outlet />;
}

/** Root landing — redirect to the user's primary portal (or /login). */
export function HomeRedirect(): React.ReactElement {
  const { user, loading } = useAuth();

  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={primaryPortal(roleNames(user))} replace />;
}
