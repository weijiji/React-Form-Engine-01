import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { config } from "../config";
import { closeDb, getDb } from "../db/connection";
import { runMigrations, runSeedIfEmpty } from "../db/migrate";

/**
 * NL route integration tests (二级 seam) — auth (401), permission (403),
 * validation (422), and the LLM / rule-fallback paths through the API with a
 * stubbed global `fetch` and a mutated key.
 */

const app = createApp();
const anthropicConfig = config as unknown as { anthropic: { apiKey: string } };

function toolResponse(input: unknown): Response {
  return new Response(JSON.stringify({ content: [{ type: "tool_use", input }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

let ipSeed = 0;
function nextIp(): string {
  ipSeed += 1;
  return `10.2.0.${ipSeed}`;
}

/** Login a user and return an agent carrying the CSRF token. */
async function session(email: string, password: string): Promise<{ agent: request.Agent; csrf: string }> {
  const agent = request.agent(app);
  const login = await agent
    .post("/api/v1/auth/login")
    .set("X-Forwarded-For", nextIp())
    .send({ email, password });
  return { agent, csrf: login.body.csrfToken as string };
}

beforeAll(async () => {
  await runMigrations();
  await runSeedIfEmpty();
  // Reset the LLM key to a clean state for this file.
  anthropicConfig.anthropic.apiKey = "";
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await closeDb();
});

describe("POST /api/v1/nl/generate", () => {
  it("未登录 → 401", async () => {
    const res = await request(app).post("/api/v1/nl/generate").send({ message: "请假" });
    expect(res.status).toBe(401);
  });

  it("无 template:create 权限 → 403", async () => {
    const { agent, csrf } = await session("zhangsan@example.com", "user123"); // 填写者
    const res = await agent
      .post("/api/v1/nl/generate")
      .set("X-CSRF-Token", csrf)
      .send({ message: "请假" });
    expect(res.status).toBe(403);
  });

  it("空 message → 422", async () => {
    const { agent, csrf } = await session("designer@example.com", "user123");
    const res = await agent
      .post("/api/v1/nl/generate")
      .set("X-CSRF-Token", csrf)
      .send({ message: "   " });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("无 key 时规则引擎命中，返回规则建议", async () => {
    const { agent, csrf } = await session("designer@example.com", "user123");
    const res = await agent
      .post("/api/v1/nl/generate")
      .set("X-CSRF-Token", csrf)
      .send({ message: "我要一个请假申请单" });
    expect(res.status).toBe(200);
    expect(res.body.suggestion.name).toBe("日常请假申请单");
  });

  it("规则也未命中时 suggestion 为 null", async () => {
    const { agent, csrf } = await session("designer@example.com", "user123");
    const res = await agent
      .post("/api/v1/nl/generate")
      .set("X-CSRF-Token", csrf)
      .send({ message: "装逼用表单" });
    expect(res.status).toBe(200);
    expect(res.body.suggestion).toBeNull();
  });

  it("有 key + LLM 成功，返回归一化建议", async () => {
    anthropicConfig.anthropic.apiKey = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        toolResponse({
          name: "远程办公申请单",
          sections: [
            {
              title: "基本信息",
              fields: [
                { label: "申请人", type: "text", required: true },
                { label: "远程日期", type: "date", required: true },
              ],
            },
          ],
        }),
      ),
    );
    const { agent, csrf } = await session("designer@example.com", "user123");
    const res = await agent
      .post("/api/v1/nl/generate")
      .set("X-CSRF-Token", csrf)
      .send({ message: "远程办公申请" });
    expect(res.status).toBe(200);
    expect(res.body.suggestion.name).toBe("远程办公申请单");
    expect(res.body.suggestion.sections[0].fields[0].label).toBe("申请人");
    vi.unstubAllGlobals();
    anthropicConfig.anthropic.apiKey = "";
  });

  it("LLM 失败时回退规则引擎", async () => {
    anthropicConfig.anthropic.apiKey = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const { agent, csrf } = await session("designer@example.com", "user123");
    const res = await agent
      .post("/api/v1/nl/generate")
      .set("X-CSRF-Token", csrf)
      .send({ message: "出差到上海" });
    expect(res.status).toBe(200);
    expect(res.body.suggestion.name).toBe("出差申请单");
    vi.unstubAllGlobals();
    anthropicConfig.anthropic.apiKey = "";
  });
});

describe("POST /api/v1/nl/refine", () => {
  it("无 key → 503 NL_UNAVAILABLE", async () => {
    const { agent, csrf } = await session("designer@example.com", "user123");
    const res = await agent
      .post("/api/v1/nl/refine")
      .set("X-CSRF-Token", csrf)
      .send({ message: "去掉附件", suggestion: { name: "x", sections: [] } });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("NL_UNAVAILABLE");
  });

  it("非法 suggestion → 422", async () => {
    anthropicConfig.anthropic.apiKey = "test-key";
    const { agent, csrf } = await session("designer@example.com", "user123");
    const res = await agent
      .post("/api/v1/nl/refine")
      .set("X-CSRF-Token", csrf)
      .send({ message: "加个字段", suggestion: { sections: "nope" } });
    expect(res.status).toBe(422);
    anthropicConfig.anthropic.apiKey = "";
  });

  it("有 key + LLM 成功，返回修正建议", async () => {
    anthropicConfig.anthropic.apiKey = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        toolResponse({
          name: "x",
          sections: [{ title: "A", fields: [{ label: "f", type: "text", required: true }] }],
        }),
      ),
    );
    const { agent, csrf } = await session("designer@example.com", "user123");
    const res = await agent
      .post("/api/v1/nl/refine")
      .set("X-CSRF-Token", csrf)
      .send({ message: "加上日期", suggestion: { name: "x", sections: [] } });
    expect(res.status).toBe(200);
    expect(res.body.suggestion.sections[0].fields[0].label).toBe("f");
    vi.unstubAllGlobals();
    anthropicConfig.anthropic.apiKey = "";
  });
});

void getDb;
