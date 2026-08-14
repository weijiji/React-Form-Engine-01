import type { components } from "form-engine-core";

/**
 * API client configuration.
 * All API requests go through this centralized base URL.
 *
 * VITE_API_BASE_URL is set via environment variable or defaults to /api/v1.
 */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL || "/api/v1";

/**
 * Get the CSRF token from the non-httpOnly cookie.
 * The CSRF cookie is set by the server and readable by client-side JS.
 *
 * IMPORTANT: The cookie name "xsrf-token" must match the server's
 * CSRF_COOKIE_NAME config (default: "xsrf-token", configurable via env).
 */
function getCsrfToken(): string {
  const match = document.cookie.match(
    /(?:^|;\s*)xsrf-token=([^;]*)/
  );
  return match ? decodeURIComponent(match[1]) : "";
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** Parse a non-ok fetch Response into an ApiError (never throws). */
async function toApiError(response: Response): Promise<ApiError> {
  let errorBody: { error?: { code?: string; message?: string } } = {};
  try {
    errorBody = await response.json();
  } catch {
    // Response is not JSON
  }
  return new ApiError(
    response.status,
    errorBody.error?.code || "UNKNOWN",
    errorBody.error?.message || response.statusText,
  );
}

/** Perform a single fetch + parse. Throws ApiError on a non-ok response. */
async function doRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  // Inject CSRF token for mutating requests
  const method = (options.method || "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

/** Auth endpoints must never be retried through the silent-refresh path. */
const AUTH_PATHS = ["/auth/login", "/auth/refresh", "/auth/logout", "/auth/me"];

let refreshing: Promise<boolean> | null = null;

/** Exchange the current cookie for a fresh one (sliding expiration). */
function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        await doRequest("/auth/refresh", { method: "POST" });
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

/**
 * Typed fetch wrapper for API calls.
 * Automatically injects CSRF token for mutating requests.
 * All requests include credentials (cookies).
 *
 * On a 401 from a business endpoint (not the auth endpoints themselves), it
 * attempts one silent refresh and retries the original request once before
 * giving up — so a stale access token doesn't bounce the user to login.
 */
export async function apiClient<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  try {
    return await doRequest<T>(path, options);
  } catch (err) {
    if (
      err instanceof ApiError &&
      err.statusCode === 401 &&
      !AUTH_PATHS.some((p) => path.startsWith(p))
    ) {
      if (await refreshSession()) {
        return await doRequest<T>(path, options);
      }
    }
    throw err;
  }
}

// ── Auth convenience methods (work order 17) ────────────────────────────────

type AuthResponse = components["schemas"]["AuthResponse"];

/** POST /auth/login — issues the session cookies and returns the user. */
export function login(email: string, password: string): Promise<AuthResponse> {
  return apiClient<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

/** POST /auth/logout — clears the session cookies. */
export function logout(): Promise<void> {
  return apiClient<void>("/auth/logout", { method: "POST" });
}

/** GET /auth/me — the authenticated user with roles + permissions. */
export function getMe(): Promise<AuthResponse> {
  return apiClient<AuthResponse>("/auth/me");
}
