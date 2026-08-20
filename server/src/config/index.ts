import dotenv from "dotenv";
import path from "path";

// Load .env from project root (server/../.env)
// __dirname = server/src/config → resolve to project root
dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });

export const config = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.SERVER_PORT || "3001", 10),

  database: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://form_engine:form_engine_pass@localhost:5432/form_engine_db",
  },

  jwt: {
    secret: process.env.JWT_SECRET || "dev-secret-change-in-production",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    cookieName: process.env.JWT_COOKIE_NAME || "access_token",
  },

  auth: {
    // Sliding-expiration login window (7 days, CONTEXT.md "滑动过期").
    sessionTtlSeconds: 7 * 24 * 60 * 60,
    // Login rate limit (ID-15: 5 / min / IP, brute-force protection).
    loginRateLimit: {
      windowMs: 60 * 1000,
      max: 5,
    },
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost")
      .split(",")
      .map((o) => o.trim()),
  },

  csrf: {
    cookieName: process.env.CSRF_COOKIE_NAME || "xsrf-token",
  },

  logging: {
    level: process.env.LOG_LEVEL || "info",
  },

  // NL 表单生成（ADR-0013）。ANTHROPIC_API_KEY 可选 —— 未配置时 NL 生成降级到
  // 本地规则引擎；refine（追加修正）无 key 时返回 503 NL_UNAVAILABLE。
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
    maxTokens: 1024,
  },

  get isDev(): boolean {
    return this.env === "development";
  },
  get isProd(): boolean {
    return this.env === "production";
  },
} as const;
