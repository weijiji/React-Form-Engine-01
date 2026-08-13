import { render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  RouterProvider,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "./index";

// react-router's data router (createMemoryRouter) builds a `Request` for every
// navigation. jsdom's AbortController yields an AbortSignal that Node's native
// undici `Request` rejects (cross-realm instanceof). Our routes carry no
// loaders, so the router only needs the request's url/signal — swap in a
// minimal stub that skips undici's signal validation.
class TestRequest {
  readonly url: string;
  readonly method = "GET";
  readonly signal: AbortSignal | null;
  readonly redirect = "follow";
  readonly headers = {
    set() {},
    has() {
      return false;
    },
    get() {
      return null;
    },
  };

  constructor(input: string, init?: { signal?: AbortSignal | null }) {
    this.url = input;
    this.signal = init?.signal ?? null;
  }

  clone() {
    return this;
  }
  text() {
    return Promise.resolve("");
  }
  formData() {
    return Promise.resolve(null as never);
  }
  json() {
    return Promise.resolve({});
  }
}

// The designer pages (TemplatesPage/DesignerPage) fetch from the API on mount;
// stub fetch so portal tests don't hit the network.
function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

// The portal's brand-sub is rendered in the sidebar (and duplicated in the
// topbar crumb, matching the prototype), so assert it via the `.brand-sub` node.
async function expectBrandSub(text: string) {
  await waitFor(() => {
    expect(document.querySelector(".brand-sub")?.textContent).toBe(text);
  });
}

beforeEach(() => {
  vi.stubGlobal("Request", TestRequest);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/me")) {
        return jsonResponse({
          id: "u-zhangsan",
          name: "张三",
          email: "zhangsan@example.com",
        });
      }
      if (/\/templates\/[^/?]+$/.test(url)) {
        return jsonResponse({
          id: "tpl-1",
          name: "测试模板",
          status: "draft",
          version: 1,
          locked_by: "u-zhangsan",
          locked_by_name: "张三",
          created_by: "u-zhangsan",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          schema: { schemaVersion: "1.0.0", sections: [] },
        });
      }
      if (url.includes("/templates")) {
        return jsonResponse({ items: [], total: 0, page: 1, pageSize: 50 });
      }
      // Filler pages (work order 05) fetch these on mount; empty lists keep the
      // portal-nav tests independent of the filler's own data.
      if (url.includes("/forms") || url.includes("/instances") || url.includes("/drafts")) {
        return jsonResponse({ items: [], total: 0, page: 1, pageSize: 100 });
      }
      return jsonResponse({
        status: "ok",
        db: "connected",
        timestamp: "test",
        uptime: 0,
        env: "test",
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("five-portal routing (issue 16)", () => {
  it("redirects the root to the designer portal", async () => {
    renderAt("/");
    await expectBrandSub("模板设计者门户");
  });

  it.each([
    ["/designer", "模板设计者门户", "创建表单"],
    ["/filler", "表单填写者门户", "表单中心"],
    ["/approver", "审批人门户", "已审批"],
    ["/admin", "系统管理员门户", "用户管理"],
    ["/ops", "运维人员门户", "导入配置"],
  ] as const)("%s renders its own shell + nav", async (path, brandSub, navItem) => {
    renderAt(path);
    await expectBrandSub(brandSub);
    expect(
      screen.getByRole("link", { name: new RegExp(navItem) }),
    ).toBeInTheDocument();
  });

  it("renders /designer/templates (designer landing)", async () => {
    renderAt("/designer/templates");
    expect(await screen.findByText(/暂无模板/)).toBeInTheDocument();
  });

  it("renders /designer/templates/:id (designer workbench)", async () => {
    renderAt("/designer/templates/tpl-1");
    expect(
      await screen.findByRole("heading", { name: "测试模板" }),
    ).toBeInTheDocument();
    expect(screen.getByText("已签出 · 正在编辑")).toBeInTheDocument();
  });

  it("renders the designer workbench full-screen (no Shell sidebar/topbar)", async () => {
    renderAt("/designer/templates/tpl-1");
    await screen.findByRole("heading", { name: "测试模板" });
    expect(document.querySelector(".editor")).toBeInTheDocument();
    expect(document.querySelector(".shell")).not.toBeInTheDocument();
    expect(document.querySelector(".sidebar")).not.toBeInTheDocument();
  });

  it("no longer treats /admin as the designer portal", async () => {
    renderAt("/admin");
    await expectBrandSub("系统管理员门户");
    expect(
      screen.getByRole("link", { name: /用户管理/ }),
    ).toBeInTheDocument();
    // The designer's "我的模板" nav must not leak into the admin portal.
    expect(
      screen.queryByRole("link", { name: /我的模板/ }),
    ).not.toBeInTheDocument();
  });
});
