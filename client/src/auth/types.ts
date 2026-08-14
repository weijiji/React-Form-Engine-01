import type { components } from "form-engine-core";

/**
 * Auth types (work order 17). Surfaced through the generated API contract
 * (ADR-0007) via `form-engine-core`. `AuthResponse` is the body of login /
 * refresh / me — the `csrfToken` field is present only on login/refresh.
 */
export type AuthUser = components["schemas"]["AuthResponse"];
export type AuthRole = components["schemas"]["RoleSummary"];
