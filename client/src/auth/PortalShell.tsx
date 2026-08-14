import React from "react";
import { Shell, type NavGroup, type ShellPortal } from "../layouts/Shell";
import { useAuth } from "./AuthContext";
import { portalsForRoles } from "./roles";

interface PortalShellProps {
  brandSub: string;
  navGroups: NavGroup[];
}

/**
 * Portal shell (work order 17). Wraps the shared `Shell` with the real
 * authenticated user, a sign-out button, and the portal switcher — replacing
 * the pre-auth hardcoded demo users.
 */
export const PortalShell: React.FC<PortalShellProps> = ({
  brandSub,
  navGroups,
}) => {
  const { user, logout } = useAuth();

  // Guarded upstream by RequireAuth/RequireRole, but keep the type checker calm.
  if (!user) return null;

  const roleNames = user.roles.map((r) => r.name);
  const portals: ShellPortal[] = portalsForRoles(roleNames).map((p) => ({
    to: p.to,
    label: p.role,
  }));

  return (
    <Shell
      brandName="动态表单引擎"
      brandSub={brandSub}
      navGroups={navGroups}
      user={{ name: user.name, role: roleNames.join("、") || "用户" }}
      onLogout={() => void logout()}
      portals={portals}
    />
  );
};
