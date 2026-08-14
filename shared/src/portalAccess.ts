/**
 * Portal ↔ permission-code mapping (work order 18). A portal unlocks when the
 * user holds ANY of its codes (OR semantics). This module is the single source
 * of truth for what the five portals require — the client gates routes and nav
 * on it, and the server will enforce the same codes on the portal APIs.
 *
 * The unlock sets are curated to keep portals disjoint: `template:import` /
 * `template:export` belong to both 设计者 and 运维, so they are excluded from
 * the designer unlock set to stop an ops user from slipping into the designer
 * portal.
 */

export interface PortalDef {
  /** Portal route prefix, e.g. "/designer". */
  path: string;
  /** Portal label shown in the switcher, e.g. "设计者". */
  label: string;
  /** Unlock codes — holding any one grants access (OR). */
  codes: string[];
}

/** The five portals in landing-priority order (first match wins). */
export const PORTALS: PortalDef[] = [
  {
    path: "/admin",
    label: "管理员",
    codes: ["admin:manage_roles", "admin:manage_users"],
  },
  {
    path: "/designer",
    label: "设计者",
    codes: [
      "template:create",
      "template:edit",
      "template:delete",
      "template:publish",
      "template:force_unlock",
    ],
  },
  {
    path: "/filler",
    label: "填写者",
    codes: ["form:fill", "form:submit", "form:withdraw"],
  },
  {
    path: "/approver",
    label: "审批者",
    codes: [
      "approval:view_pending",
      "approval:approve",
      "approval:reject",
      "approval:return",
      "approval:transfer",
    ],
  },
  {
    path: "/ops",
    label: "运维",
    codes: ["data:view", "data:export", "data:view_stats"],
  },
];

/** True when `have` contains at least one of `codes` (OR semantics). */
export function canAccessAny(codes: string[], have: string[]): boolean {
  return codes.some((code) => have.includes(code));
}

/** The portals the user's permission codes unlock, in priority order. */
export function portalsForPermissions(permissions: string[]): PortalDef[] {
  return PORTALS.filter((p) => canAccessAny(p.codes, permissions));
}

/** The user's primary portal — highest-priority portal they can unlock. */
export function primaryPortal(permissions: string[]): string {
  return portalsForPermissions(permissions)[0]?.path ?? "/filler";
}
