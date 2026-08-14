import React from "react";
import { Shell, type NavGroup } from "../layouts/Shell";
import { filterNavGroups } from "./permissions";
import { useAuth } from "./AuthContext";

interface AuthenticatedShellProps {
  navGroups: NavGroup[];
}

/**
 * Authenticated shell (ADR-0010). Renders the shared `Shell` once with the
 * unified nav filtered to what the user's permission codes unlock — replacing
 * the per-portal `PortalShell`. Access is decided by `user.permissions`, never
 * by role name or portal membership; role names only remain as the display
 * label under the user chip.
 */
export const AuthenticatedShell: React.FC<AuthenticatedShellProps> = ({
  navGroups,
}) => {
  const { user, logout } = useAuth();

  // Guarded upstream by RequireAuth, but keep the type checker calm.
  if (!user) return null;

  return (
    <Shell
      brandName="动态表单引擎"
      navGroups={filterNavGroups(navGroups, user.permissions)}
      user={{
        name: user.name,
        role: user.roles.map((r) => r.name).join("、") || "用户",
      }}
      onLogout={() => void logout()}
    />
  );
};
