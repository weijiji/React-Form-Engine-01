import type { Response } from "express";
import { config } from "../config";
import { accessTokenTtlSeconds } from "./jwt";

/**
 * Auth cookie plumbing (work order 09).
 *
 * Two cookies back the session, per the design spec §7.2:
 *  - `access_token` — httpOnly, Secure, SameSite=Strict JWT (JS cannot read it).
 *  - `xsrf-token`     — non-httpOnly, so the client can read it and echo it in
 *                       the `X-CSRF-Token` header for the double-submit check.
 *
 * `secure` is gated on production: local dev runs over plain http, where a
 * `Secure` cookie would never be returned by the browser.
 */

function baseCookieOptions(secure: boolean) {
  return {
    secure,
    sameSite: "strict" as const,
    path: "/",
  };
}

/** Set the httpOnly JWT cookie and the JS-readable CSRF cookie. */
export function setAuthCookies(
  res: Response,
  token: string,
  csrfToken: string,
): void {
  const maxAgeMs = accessTokenTtlSeconds() * 1000;
  res.cookie(config.jwt.cookieName, token, {
    ...baseCookieOptions(config.isProd),
    httpOnly: true,
    maxAge: maxAgeMs,
  });
  res.cookie(config.csrf.cookieName, csrfToken, {
    ...baseCookieOptions(config.isProd),
    httpOnly: false,
    maxAge: maxAgeMs,
  });
}

/** Clear both session cookies (logout). */
export function clearAuthCookies(res: Response): void {
  res.clearCookie(config.jwt.cookieName, baseCookieOptions(config.isProd));
  res.clearCookie(config.csrf.cookieName, baseCookieOptions(config.isProd));
}
