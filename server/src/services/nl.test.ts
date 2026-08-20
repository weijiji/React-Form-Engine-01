import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../config";
import { callAnthropic, generateSuggestion, refineSuggestion } from "./nl";

/**
 * NL service unit tests — the Anthropic call is stubbed via the global `fetch`
 * (no real key, no network). Config key is mutated per-test (the service reads
 * it at call time).
 */

const anthropicConfig = config as unknown as { anthropic: { apiKey: string } };

function toolResponse(input: unknown): Response {
  return new Response(JSON.stringify({ content: [{ type: "tool_use", input }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function leaveInput() {
  return {
    name: "日常请假申请单",
    description: "员工日常请假的申请表单",
    sections: [
      {
        title: "请假信息",
        fields: [
          { label: "请假类型", type: "select", required: true, options: ["年假", "事假"] },
          { label: "开始日期", type: "date", required: true },
        ],
      },
    ],
  };
}

beforeEach(() => {
  anthropicConfig.anthropic.apiKey = "test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("callAnthropic", () => {
  it("解析 tool_use 输出并归一化为建议", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => toolResponse(leaveInput())));
    const s = await callAnthropic("请假");
    expect(s.name).toBe("日常请假申请单");
    expect(s.sections[0].fields[0].type).toBe("select");
    expect(s.sections[0].fields[0].options).toEqual(["年假", "事假"]);
  });

  it("LLM 未知字段类型归一为 text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        toolResponse({
          name: "x",
          sections: [{ title: "A", fields: [{ label: "f", type: "怪异控件", required: false }] }],
        }),
      ),
    );
    const s = await callAnthropic("x");
    expect(s.sections[0].fields[0].type).toBe("text");
  });

  it("非 2xx 抛错", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    await expect(callAnthropic("x")).rejects.toThrow();
  });

  it("无 tool_use 块抛错", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ content: [{ type: "text", text: "hi" }] }), { status: 200 }),
      ),
    );
    await expect(callAnthropic("x")).rejects.toThrow();
  });
});

describe("generateSuggestion", () => {
  it("LLM 成功返回建议", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => toolResponse(leaveInput())));
    const s = await generateSuggestion("请假");
    expect(s?.name).toBe("日常请假申请单");
  });

  it("LLM 失败回退规则引擎", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const s = await generateSuggestion("我要请假");
    expect(s?.name).toBe("日常请假申请单");
  });

  it("无 key 直接走规则引擎", async () => {
    anthropicConfig.anthropic.apiKey = "";
    const s = await generateSuggestion("我要请假");
    expect(s?.name).toBe("日常请假申请单");
  });

  it("规则未命中返回 null", async () => {
    anthropicConfig.anthropic.apiKey = "";
    expect(await generateSuggestion("装逼用表单")).toBeNull();
  });
});

describe("refineSuggestion", () => {
  it("无 key 抛 NL_UNAVAILABLE(503)", async () => {
    anthropicConfig.anthropic.apiKey = "";
    await expect(refineSuggestion("去掉附件", { name: "x", sections: [] })).rejects.toMatchObject({
      code: "NL_UNAVAILABLE",
      statusCode: 503,
    });
  });

  it("LLM 成功返回修正建议", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        toolResponse({
          name: "x",
          sections: [{ title: "A", fields: [{ label: "f", type: "text", required: true }] }],
        }),
      ),
    );
    const s = await refineSuggestion("加上日期", { name: "x", sections: [] });
    expect(s.name).toBe("x");
  });
});
