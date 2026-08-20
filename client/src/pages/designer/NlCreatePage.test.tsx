import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NlCreatePage } from "./NlCreatePage";

/**
 * NL 创建页组件测试（ADR-0013）。用 stub 全局 fetch 走真实 apiClient（与
 * FormCenter.test.tsx 同模式）；导航用 mock 的 useNavigate 断言跳转目标。
 * 覆盖：初始欢迎/示例、生成→预览编辑、确认→translateSuggestion + POST
 * /templates + 跳设计器、无匹配失败态、refine 503 保留建议。
 */

const navigateMock = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
}));

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

const SUGGESTION = {
  name: "远程办公申请单",
  description: "远程办公申请",
  sections: [
    {
      title: "基本信息",
      fields: [{ label: "申请人", type: "text", required: true }],
    },
  ],
};

const inputPlaceholder = "描述你的表单需求，按 Enter 发送…";

afterEach(() => {
  vi.unstubAllGlobals();
  navigateMock.mockReset();
});

describe("NlCreatePage", () => {
  it("初始渲染欢迎语与六个快捷示例", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<NlCreatePage />);
    expect(screen.getByText(/你好，我是表单助手/)).toBeInTheDocument();
    for (const label of ["请假申请单", "采购申请单", "设备报备单", "报销申请单", "出差申请单", "入职登记表"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("生成成功后展示可编辑预览卡", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/nl/generate")) return jsonResponse({ suggestion: SUGGESTION });
        return jsonResponse({ error: { code: "NOT_FOUND", message: "404" } }, false, 404);
      }),
    );
    const user = userEvent.setup();
    render(<NlCreatePage />);

    await user.type(screen.getByPlaceholderText(inputPlaceholder), "远程办公申请");
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByDisplayValue("远程办公申请单")).toBeInTheDocument();
    expect(screen.getByDisplayValue("申请人")).toBeInTheDocument();
    expect(screen.getByText(/生成了下面的表单结构/)).toBeInTheDocument();
  });

  it("编辑字段标签后确认：POST /templates 携带翻译 schema 并跳转设计器", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/nl/generate")) return jsonResponse({ suggestion: SUGGESTION });
      if (url.includes("/templates") && init?.method === "POST") {
        return jsonResponse({ id: "tpl-1", name: "远程办公申请单" });
      }
      return jsonResponse({ error: { code: "NOT_FOUND", message: "404" } }, false, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<NlCreatePage />);

    await user.type(screen.getByPlaceholderText(inputPlaceholder), "远程办公申请");
    await user.click(screen.getByRole("button", { name: "生成" }));
    await screen.findByDisplayValue("申请人");

    await user.clear(screen.getByPlaceholderText("字段标签"));
    await user.type(screen.getByPlaceholderText("字段标签"), "申请人姓名");
    await user.click(screen.getByRole("button", { name: "创建并进入设计器" }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/designer/templates/tpl-1"));

    // 确认调用复用模板创建流：category null + translateSuggestion 产物（合法 schema）
    const tplCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/templates"));
    const body = JSON.parse(String((tplCall?.[1] as RequestInit | undefined)?.body));
    expect(body.name).toBe("远程办公申请单");
    expect(body.category).toBeNull();
    expect(body.schema.schemaVersion).toBe("1.0.0");
    expect(body.schema.sections[0].fields[0].label).toBe("申请人姓名");
    expect(body.schema.sections[0].fields[0].id).toMatch(/^fld-/);
  });

  it("规则/LLM 均未命中时给出失败提示", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ suggestion: null })));
    const user = userEvent.setup();
    render(<NlCreatePage />);

    await user.type(screen.getByPlaceholderText(inputPlaceholder), "装逼用表单");
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByText(/没能理解你的需求/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue("装逼用表单")).not.toBeInTheDocument();
  });

  it("refine 返回 503 时提示可手动编辑，且保留当前建议", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/nl/generate")) return jsonResponse({ suggestion: SUGGESTION });
        if (url.includes("/nl/refine")) {
          return jsonResponse(
            { error: { code: "NL_UNAVAILABLE", message: "当前环境未配置 AI，无法继续修正，请直接在预览中编辑" } },
            false,
            503,
          );
        }
        return jsonResponse({ error: { code: "NOT_FOUND", message: "404" } }, false, 404);
      }),
    );
    const user = userEvent.setup();
    render(<NlCreatePage />);

    await user.type(screen.getByPlaceholderText(inputPlaceholder), "远程办公申请");
    await user.click(screen.getByRole("button", { name: "生成" }));
    await screen.findByDisplayValue("远程办公申请单");

    await user.type(screen.getByPlaceholderText(/继续修改/), "去掉附件");
    await user.click(screen.getByRole("button", { name: "修改" }));

    expect(await screen.findByText(/当前环境未配置 AI/)).toBeInTheDocument();
    // 建议未被清空，仍可手动编辑
    expect(screen.getByDisplayValue("远程办公申请单")).toBeInTheDocument();
  });
});
