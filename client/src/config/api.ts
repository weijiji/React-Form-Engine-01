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

/**
 * Typed fetch wrapper for API calls.
 * Automatically injects CSRF token for mutating requests.
 * All requests include credentials (cookies).
 */
export async function apiClient<T>(
  path: string,
  options: RequestInit = {}
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
    let errorBody: { error?: { code?: string; message?: string } } = {};
    try {
      errorBody = await response.json();
    } catch {
      // Response is not JSON
    }
    throw new ApiError(
      response.status,
      errorBody.error?.code || "UNKNOWN",
      errorBody.error?.message || response.statusText
    );
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}
