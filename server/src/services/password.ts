import crypto from "crypto";

/**
 * Password hashing (CONTEXT.md "User.password_hash").
 *
 * PBKDF2-SHA512 with a per-password random salt, stored as `<salt>:<hash>` hex.
 * This is the single source of truth for how password hashes are produced and
 * verified — the seed and the login route both go through here so a seeded
 * account can log in (work order 09).
 */

const ITERATIONS = 10000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";

/** Produce a salted PBKDF2 hash in `salt:hash` form. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST)
    .toString("hex");
  return `${salt}:${hash}`;
}

/** Constant-time verification of a password against a `salt:hash` string. */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;

  const candidate = crypto.pbkdf2Sync(
    password,
    salt,
    ITERATIONS,
    KEY_LENGTH,
    DIGEST,
  );
  const candidateHex = candidate.toString("hex");

  const candidateBuf = Buffer.from(candidateHex, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (candidateBuf.length !== expectedBuf.length) return false;

  return crypto.timingSafeEqual(candidateBuf, expectedBuf);
}
