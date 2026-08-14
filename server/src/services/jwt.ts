import crypto from "crypto";
import { config } from "../config";

/**
 * Minimal HS256 JWT sign/verify (work order 09).
 *
 * The server has no `jsonwebtoken` dependency; a compact hand-rolled
 * implementation keeps the surface small and testable. Tokens carry
 * `sub` (user id), `iat`, and `exp` and are signed with the shared
 * `JWT_SECRET`.
 */

const ALG = "HS256";
const SEGMENTS = 3;

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buf.toString("base64url");
}

function base64urlDecode(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

function sign(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

/** Parse a duration string like `7d`, `12h`, `30m`, `90s` into seconds. */
export function parseDurationSeconds(raw: string, fallback: number): number {
  const match = /^(\d+)([dhms])$/i.exec(raw.trim());
  if (!match) return fallback;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  return value * multipliers[unit];
}

interface TokenPayload {
  sub: string;
  iat: number;
  exp: number;
}

function decodePayload(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== SEGMENTS) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  const expected = sign(`${headerB64}.${payloadB64}`, config.jwt.secret);
  if (signatureB64 !== expected) return null;

  const header = JSON.parse(base64urlDecode(headerB64).toString("utf8")) as {
    alg?: string;
  };
  if (header.alg !== ALG) return null;

  const payload = JSON.parse(
    base64urlDecode(payloadB64).toString("utf8"),
  ) as TokenPayload;
  if (typeof payload.sub !== "string" || payload.sub === "") return null;

  return payload;
}

/**
 * Issue an access token for a user, expiring after `expiresInSeconds`. When
 * `issuedAt` is provided (refresh), the original session start is preserved so
 * the absolute session cap in `verifyRefreshToken` still binds.
 */
export function signAccessToken(
  userId: string,
  expiresInSeconds?: number,
  issuedAt?: number,
): string {
  const ttl = expiresInSeconds ?? accessTokenTtlSeconds();
  const iat = issuedAt ?? Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: ALG, typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ sub: userId, iat, exp: iat + ttl }),
  );
  const signature = sign(`${header}.${payload}`, config.jwt.secret);
  return `${header}.${payload}.${signature}`;
}

/**
 * Verify signature AND expiry. Returns the payload's subject on success,
 * `null` when the token is malformed, tampered, or expired.
 */
export function verifyAccessToken(token: string): string | null {
  const payload = decodePayload(token);
  if (!payload) return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return payload.sub;
}

/**
 * Verify the signature and enforce the absolute session cap, ignoring `exp`.
 * Used by `/auth/refresh` for sliding expiration: a signature-valid token is
 * exchangeable for a fresh one, but only within `sessionTtlSeconds` of its
 * original issue (`iat`) — so a session cannot outlive the 7-day login even
 * under constant refreshing. Returns the subject and original issue time so the
 * caller can re-issue with the same `iat`.
 */
export function verifyRefreshToken(
  token: string,
): { sub: string; iat: number } | null {
  const payload = decodePayload(token);
  if (!payload) return null;
  const now = Math.floor(Date.now() / 1000);
  if (now - payload.iat > config.auth.sessionTtlSeconds) return null;
  return { sub: payload.sub, iat: payload.iat };
}

/** Default access-token TTL in seconds, derived from `JWT_EXPIRES_IN` (7d). */
export function accessTokenTtlSeconds(): number {
  return parseDurationSeconds(config.jwt.expiresIn, 7 * 86400);
}

/** Generate a fresh CSRF token (unpredictable, base64url). */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}
