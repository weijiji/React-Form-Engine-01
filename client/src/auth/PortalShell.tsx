import React from "react";
import { portalsForPermissions } from "form-engine-core";
import {
  Shell,
  filterNavGroups,
  type NavGroup,
  type ShellPortal,
} from "../layouts/Shell";
import { useAuth } from "./AuthContext";

interface PortalShellProps {
  brandSub: string;
  navGroups: NavGroup[];
}

/**
 * Portal shell (work order 17; permission-driven since work order 18). Wraps
 * the shared `Shell` with the real authenticated user, a sign-out button, and
 * the portal switcher. Both the switchable portals and the nav items are
 * derived from the user's permission codes — the role names only remain as the
 * display label under the user chip.
 */
export const PortalShell: React.FC<PortalShellProps> = ({
  brandSub,
  navGroups,
}) => {
  const { user, logout } = useAuth();

  // Guarded upstream by RequireAuth/RequirePermission, but keep the type checker calm.
  if (!user) return null;

  const portals: ShellPortal[] = portalsForPermissions(user.permissions).map(
    (p) => ({ to: p.path, label: p.label }),
  );

  return (
    <Shell
      brandName="动态表单引擎"
      brandSub={brandSub}
      navGroups={filterNavGroups(navGroups, user.permissions)}
      user={{ name: user.name, role: user.roles.map((r) => r.name).join("、") || "用户" }}
      onLogout={() => void logout()}
      portals={portals}
    />
  );
};
