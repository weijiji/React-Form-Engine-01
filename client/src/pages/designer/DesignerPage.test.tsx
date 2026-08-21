import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthContext";
import { DesignerPage } from "./DesignerPage";

/**
 * Regression tests for the designer publish flow.
 *
 * The reported bug: after "发布", the designer's changes are lost on re-enter.
 * `POST /publish` only flips status + clears the lock — it never carries the
 * schema — so the client MUST persist the schema (`PUT /schema`) before
 * publishing, for BOTH the first (draft) publish and a re-publish. This
 * harness stubs `fetch` and records every mutating call so we can assert, at
 * the exact seam the UI drives, what reaches the server.
 */

const USER_ID = "u-1";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function authBody() {
  return {
    id: USER_ID,
    name: "设计员",
    email: "designer@example.com",
    roles: [{ id: "role-1", name: "设计者", description: null }],
    permissions: ["template:create", "template:edit", "template:publish"],
  };
}

function template(schema: unknown, overrides: Record<string, unknown> = {}) {
  return {
    id: "tpl-1",
    name: "测试模板",
    description: null,
    category: null,
    version: 1,
    schema,
    approval_chain: null,
    status: "draft",
    locked_by: null,
    locked_by_name: null,
    locked_at: null,
    created_by: USER_ID,
    created_by_name: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const emptySchema = { schemaVersion: "1.0.0", sections: [] };
const schemaWithOneField = {
  schemaVersion: "1.0.0",
  sections: [
    {
      id: "s1",
      title: "章节",
      fields: [{ id: "f1", type: "text", label: "文本字段", required: false }],
    },
  ],
};

type Call = { url: string; method: string; body: unknown };

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/designer/templates/tpl-1"]}>
      <AuthProvider>
        <Routes>
          <Route path="/designer/templates/:id" element={<DesignerPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("DesignerPage publish persists the schema", () => {
  let calls: Call[];
  /** The schema currently "stored" by the mocked server (mutated by PUT). */
  let stored: unknown;
  /** The status/lock flags currently "stored" by the mocked server. */
  let storedState: { status: string; locked_by: string | null; locked_by_name: string | null };

  beforeEach(() => {
    calls = [];
    stored = emptySchema;
    storedState = { status: "draft", locked_by: USER_ID, locked_by_name: "设计员" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
        const url = String(input);
        const method = (options?.method || "GET").toUpperCase();
        if (method !== "GET") {
          calls.push({
            url,
            method,
            body: options?.body ? JSON.parse(String(options.body)) : null,
          });
        }

        if (url.includes("/auth/me")) return jsonResponse(authBody());
        if (url.includes("/auth/refresh")) {
          return jsonResponse({ error: { code: "UNAUTHORIZED" } }, 401);
        }

        // GET the template: return the current stored schema + state.
        if (method === "GET" && /\/templates\/tpl-1$/.test(url)) {
          return jsonResponse(template(stored, storedState));
        }

        // Checkout: hand the lock to the caller.
        if (method === "POST" && url.endsWith("/checkout")) {
          storedState = { ...storedState, locked_by: USER_ID, locked_by_name: "设计员" };
          return jsonResponse(template(stored, storedState));
        }

        // Save schema: persist it and echo it back (bump version).
        if (method === "PUT" && url.endsWith("/schema")) {
          const body = options?.body ? JSON.parse(String(options.body)) : {};
          stored = body.schema;
          return jsonResponse(template(stored, { ...storedState, version: 2 }));
        }

        // Publish: flip status + clear lock, keep the stored schema.
        if (method === "POST" && url.endsWith("/publish")) {
          storedState = { status: "published", locked_by: null, locked_by_name: null };
          return jsonResponse(template(stored, { ...storedState, version: 2 }));
        }

        throw new Error(`unexpected fetch: ${method} ${url}`);
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  function putCalls() {
    return calls.filter((c) => c.method === "PUT" && c.url.endsWith("/schema"));
  }

  function fieldCount(schema: { sections: Array<{ fields: unknown[] }> }): number {
    return schema.sections.reduce((n, s) => n + s.fields.length, 0);
  }

  it("first publish (draft) persists the schema before publishing", async () => {
    renderPage();

    // Fresh draft is auto-checked-out → editable; add a field.
    await waitFor(() =>
      expect(screen.getByText("已签出 · 正在编辑")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("option", { name: "添加文本输入" }));

    fireEvent.click(screen.getByRole("button", { name: "发布" }));
    await waitFor(() => expect(screen.getByText("模板已发布")).toBeInTheDocument());

    // The draft publish MUST have persisted the schema (PUT) before flipping
    // status — otherwise the dragged field is lost on re-enter.
    const puts = putCalls();
    expect(puts).toHaveLength(1);
    const sent = (puts[0].body as { schema: { sections: Array<{ fields: unknown[] }> } }).schema;
    expect(fieldCount(sent)).toBe(1);
  });

  it("re-publish persists the current schema before publishing", async () => {
    // The template was already published and the lock released.
    stored = schemaWithOneField;
    storedState = { status: "published", locked_by: null, locked_by_name: null };
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "签出并编辑" }));
    await waitFor(() =>
      expect(screen.getByText("已签出 · 正在编辑")).toBeInTheDocument(),
    );

    // Drag a second control.
    fireEvent.click(screen.getByRole("option", { name: "添加文本输入" }));

    fireEvent.click(screen.getByRole("button", { name: "重新发布" }));
    await waitFor(() =>
      expect(screen.getByText("模板已重新发布")).toBeInTheDocument(),
    );

    const puts = putCalls();
    expect(puts).toHaveLength(1);
    const sent = (puts[0].body as { schema: { sections: Array<{ fields: unknown[] }> } }).schema;
    expect(fieldCount(sent)).toBe(2);
  });

  // ── 工具栏按钮可见性（UX 收敛）────────────────────────────────────────────
  // 未签出只给「签出并编辑」一个主动作；签出后按状态显示编辑动作，
  // 生产区（保存/发布）| 结束区（签入/删除）分组，删除 danger 放末尾（BUG-03）。
  describe("toolbar button visibility", () => {
    it("draft + 未签出：只显示「签出并编辑」，隐藏 保存草稿/发布/删除/签入", async () => {
      storedState = { status: "draft", locked_by: null, locked_by_name: null };
      renderPage();

      await screen.findByRole("button", { name: "签出并编辑" });
      expect(screen.queryByRole("button", { name: "保存草稿" })).toBeNull();
      expect(screen.queryByRole("button", { name: "发布" })).toBeNull();
      expect(screen.queryByRole("button", { name: "删除" })).toBeNull();
      expect(screen.queryByRole("button", { name: "签入" })).toBeNull();
    });

    it("published + 未签出：只显示「签出并编辑」，无禁用的「保存草稿」「重新发布」", async () => {
      storedState = { status: "published", locked_by: null, locked_by_name: null };
      renderPage();

      await screen.findByRole("button", { name: "签出并编辑" });
      expect(screen.queryByRole("button", { name: "保存草稿" })).toBeNull();
      expect(screen.queryByRole("button", { name: "发布" })).toBeNull();
      expect(screen.queryByRole("button", { name: "重新发布" })).toBeNull();
    });

    it("draft + 已签出：显示 保存草稿/发布/删除/签入", async () => {
      // beforeEach 默认 draft + locked_by = 当前用户（自动签出）。
      renderPage();

      await screen.findByText("已签出 · 正在编辑");
      expect(screen.getByRole("button", { name: "保存草稿" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "发布" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "删除" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "签入" })).toBeEnabled();
    });

    it("published + 已签出：显示「重新发布」，隐藏 发布/保存草稿/删除", async () => {
      storedState = { status: "published", locked_by: USER_ID, locked_by_name: "设计员" };
      renderPage();

      await screen.findByText("已签出 · 正在编辑");
      expect(screen.getByRole("button", { name: "重新发布" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "签入" })).toBeEnabled();
      expect(screen.queryByRole("button", { name: "发布" })).toBeNull();
      expect(screen.queryByRole("button", { name: "保存草稿" })).toBeNull();
      expect(screen.queryByRole("button", { name: "删除" })).toBeNull();
    });
  });
});
