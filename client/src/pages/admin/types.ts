import type { components } from "form-engine-core";

/**
 * Admin portal (RBAC) API types (work order 09).
 *
 * Generated API contract types (ADR-0007) surfaced through `form-engine-core`,
 * mirroring `designer/types.ts`. These correspond to the auth/roles/permissions/
 * users schemas added to openapi.yaml.
 */

export type RoleSummary = components["schemas"]["RoleSummary"];
export type Role = components["schemas"]["Role"];
export type Permission = components["schemas"]["Permission"];
export type AdminUser = components["schemas"]["AdminUser"];
export type RoleListResponse = components["schemas"]["RoleListResponse"];
export type PermissionListResponse = components["schemas"]["PermissionListResponse"];
export type UserListResponse = components["schemas"]["UserListResponse"];
export type UserCreateRequest = components["schemas"]["UserCreateRequest"];
export type UserUpdateRequest = components["schemas"]["UserUpdateRequest"];
