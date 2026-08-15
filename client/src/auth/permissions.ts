import type { NavGroup } from "../layouts/Shell";

/**
 * Permission helpers (ADR-0010). Access is decided by the user's permission
 * codes — never by role name or portal membership. The router's nav items and
 * route guards both read the same `ROUTE_CODES` map (single source of truth),
 * and these pure functions filter nav / resolve the landing against it.
 */

/** True when `have` contains at least one of `codes` (OR semantics). */
export function canAccessAny(codes: string[], have: string[]): boolean {
  return codes.some((code) => have.includes(code));
}

/**
 * Drop nav items whose permission codes (OR) the user holds none of, then drop
 * groups that end up empty. Items without `codes` are always shown.
 */
export function filterNavGroups(
  navGroups: NavGroup[],
  permissions: string[],
): NavGroup[] {
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.codes || canAccessAny(item.codes, permissions),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * The first nav item (in union order) the user's permissions unlock — the
 * landing target for the root `/`. The always-visible 通知中心 item has no
 * codes, so every signed-in user resolves to a real page; callers keep
 * `?? "/403"` as a defensive fallback if the nav were ever empty.
 */
export function firstAccessiblePath(
  navGroups: NavGroup[],
  permissions: string[],
): string | null {
  for (const group of navGroups) {
    for (const item of group.items) {
      if (!item.codes || canAccessAny(item.codes, permissions)) {
        return item.to;
      }
    }
  }
  return null;
}
