/**
 * Role ↔ portal mapping (ADR-0009, work order 17). A user may hold several
 * roles; the portal switcher lets them move between the portals those roles
 * unlock, and the priority order below picks a deterministic landing portal for
 * the post-login redirect.
 */

export interface PortalEntry {
  role: string;
  to: string;
}

/** The five fixed portal roles, in landing-priority order (first match wins). */
export const PORTALS: PortalEntry[] = [
  { role: "管理员", to: "/admin" },
  { role: "设计者", to: "/designer" },
  { role: "填写者", to: "/filler" },
  { role: "审批者", to: "/approver" },
  { role: "运维", to: "/ops" },
];

/** The portals the user's roles unlock, in priority order. */
export function portalsForRoles(roles: string[]): PortalEntry[] {
  return PORTALS.filter((p) => roles.includes(p.role));
}

/** The user's primary portal — the highest-priority role they hold. */
export function primaryPortal(roles: string[]): string {
  return portalsForRoles(roles)[0]?.to ?? "/filler";
}

/** True when the user holds at least one of the given roles. */
export function hasAnyRole(roles: string[], allowed: string[]): boolean {
  return allowed.some((r) => roles.includes(r));
}
