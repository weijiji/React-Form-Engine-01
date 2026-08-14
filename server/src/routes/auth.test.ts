import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { closeDb, getDb } from "../db/connection";
import { runMigrations, runSeedIfEmpty } from "../db/migrate";
import { signAccessToken } from "../services/jwt";

/**
 * Auth API integration tests (work order 09, 二级 seam).
 *
 * Login issues a httpOnly JWT + a JS-readable CSRF cookie; refresh implements
 * sliding expiration; logout clears both. We also cover CSRF rejection, the
 * login rate limit, and the 401/403 boundaries.
 *
 * The login rate limiter keys on `req.ip` (honouring X-Forwarded-For since the
 * app trusts the proxy). Every test logs in from its own IP so they don't
 * exhaust the shared 5/min bucket — except the dedicated rate-limit test.
 */

const app = createApp();
const COOKIE = "access_token";

let adminId: string;
let zhangsanId: string;

let ipSeed = 0;
function nextIp(): string {
  ipSeed += 1;
  return `10.0.0.${ipSeed}`;
}

beforeAll(async () => {
  await runMigrations();
  await runSeedIfEmpty();

  const users = await getDb()("users").select("id", "email");
  adminId = users.find((u) => u.email === "admin@example.com")?.id as string;
  zhangsanId = users.find((u) => u.email === "zhangsan@example.com")?.id as string;
  expect(adminId).toBeTruthy();
  expect(zhangsanId).toBeTruthy();
});

afterAll(async () => {
  await closeDb();
});

/** Fresh admin session: a cookie-jar agent + the CSRF token from login. */
async function adminSession(): Promise<{ agent: request.Agent; csrf: string }> {
  const agent = request.agent(app);
  const login = await agent
    .post("/api/v1/auth/login")
    .set("X-Forwarded-For", nextIp())
    .send({ email: "admin@example.com", password: "admin123" });
  return { agent, csrf: login.body.csrfToken as string };
}

describe("POST /api/v1/auth/login", () => {
  it("authenticates and returns user + roles + permissions + csrf token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", nextIp())
      .send({ email: "admin@example.com", password: "admin123" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(adminId);
    expect(res.body.name).toBe("系统管理员");
    expect(Array.isArray(res.body.roles)).toBe(true);
    expect(res.body.permissions).toContain("admin:manage_roles");
    expect(typeof res.body.csrfToken).toBe("string");

    const setCookies = (res.headers["set-cookie"] as unknown as string[]) ?? [];
    expect(setCookies.some((c) => c.startsWith(`${COOKIE}=`))).toBe(true);
    expect(setCookies.some((c) => c.startsWith(`${COOKIE}=`) && c.includes("HttpOnly"))).toBe(true);
    expect(setCookies.some((c) => c.startsWith("xsrf-token="))).toBe(true);
  });

  it("rejects a wrong password with a uniform 401", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", nextIp())
      .send({ email: "admin@example.com", password: "wrong-pass" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects an unknown email with the same 401 (no enumeration)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", nextIp())
      .send({ email: "nobody@example.com", password: "whatever" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects a missing email/password with 422", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", nextIp())
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rate-limits login to 5/min/IP", async () => {
    const ip = "198.51.100.99";
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Forwarded-For", ip)
        .send({ email: "admin@example.com", password: "wrong-pass" });
      expect(res.status).toBe(401);
    }
    const limited = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", ip)
      .send({ email: "admin@example.com", password: "wrong-pass" });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
  });
});

describe("GET /api/v1/auth/me", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns the current user with roles + permissions when authenticated", async () => {
    const { agent } = await adminSession();
    const res = await agent.get("/api/v1/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(adminId);
    expect(res.body.permissions).toContain("admin:manage_users");
  });

  it("returns 401 for a tampered/expired token", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", [`${COOKIE}=not-a-real-token`]);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/auth/refresh (sliding expiration)", () => {
  it("reissues a fresh token for a valid session", async () => {
    const { agent, csrf } = await adminSession();
    const res = await agent.post("/api/v1/auth/refresh").set("X-CSRF-Token", csrf);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(adminId);
    expect(typeof res.body.csrfToken).toBe("string");
  });

  it("exchanges an expired-but-valid token for a new one", async () => {
    const expired = signAccessToken(adminId, -100); // exp already in the past
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", [`${COOKIE}=${expired}`]);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(adminId);
  });

  it("rejects a token whose session is older than the absolute 7-day cap", async () => {
    const now = Math.floor(Date.now() / 1000);
    const stale = signAccessToken(adminId, undefined, now - 8 * 86400);
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", [`${COOKIE}=${stale}`]);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe("CSRF protection", () => {
  it("rejects a mutating request missing the X-CSRF-Token header (403)", async () => {
    const { agent } = await adminSession();
    const res = await agent.post("/api/v1/auth/refresh"); // no X-CSRF-Token header
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_TOKEN_MISSING");
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("clears the session so /me returns 401 afterwards", async () => {
    const { agent, csrf } = await adminSession();
    const logout = await agent.post("/api/v1/auth/logout").set("X-CSRF-Token", csrf);
    expect(logout.status).toBe(204);

    const me = await agent.get("/api/v1/auth/me");
    expect(me.status).toBe(401);
  });
});

describe("permission gating (403)", () => {
  it("denies a non-admin user access to the roles endpoint", async () => {
    const agent = request.agent(app);
    const login = await agent
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", nextIp())
      .send({ email: "zhangsan@example.com", password: "user123" });
    expect(login.status).toBe(200);
    expect(login.body.permissions).not.toContain("admin:manage_roles");

    const res = await agent.get("/api/v1/roles");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});
