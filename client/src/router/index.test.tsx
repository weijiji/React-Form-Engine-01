import { render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  RouterProvider,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthContext";
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

// The authenticated user reported by GET /auth/me. `null` = unauthenticated.
interface TestUser {
  name: string;
  email: string;
  roles: string[];
}

const DESIGNER: TestUser = { name: "设计员", email: "designer@example.com", roles: ["设计者"] };

let currentUser: TestUser | null;

function authBody(u: TestUser) {
  return {
    id: "u-1",
    name: u.name,
    email: u.email,
    roles: u.roles.map((r) => ({ id: `role-${r}`, name: r, description: null })),
    permissions: [],
  };
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

/** Render a route as a user holding the given roles (designer by default). */
function renderAs(path: string, user: TestUser = DESIGNER) {
  currentUser = user;
  return renderAt(path);
}

// The portal's brand-sub is rendered in the sidebar (and duplicated in the
// topbar crumb, matching the prototype), so assert it via the `.brand-sub` node.
async function expectBrandSub(text: string) {
  await waitFor(() => {
    expect(document.querySelector(".brand-sub")?.textContent).toBe(text);
  });
}

beforeEach(() => {
  currentUser = DESIGNER;
  vi.stubGlobal("Request", TestRequest);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      const method = (options?.method || "GET").toUpperCase();

      // Auth bootstrap: the AuthProvider resolves the session from /auth/me.
      if (url.includes("/auth/me")) {
        if (!currentUser) {
          return jsonResponse(
            { error: { code: "UNAUTHORIZED", message: "请先登录" } },
            401,
          );
        }
        return jsonResponse(authBody(currentUser));
      }
      // Silent-refresh fallback: always fail so an expired session stays signed out.
      if (url.includes("/auth/refresh")) {
        return jsonResponse(
          { error: { code: "UNAUTHORIZED", message: "请先登录" } },
          401,
        );
      }
      if (method === "POST" && url.includes("/auth/logout")) {
        return jsonResponse(undefined, 204);
      }
      if (/\/templates\/[^/?]+$/.test(url)) {
        return jsonResponse({
          id: "tpl-1",
          name: "测试模板",
          status: "draft",
          version: 1,
          locked_by: "u-1",
          locked_by_name: "设计员",
          created_by: "u-1",
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
  currentUser = null;
  vi.unstubAllGlobals();
});

describe("five-portal routing (issue 16, wired to auth in work order 17)", () => {
  it("redirects the root to the user's primary portal", async () => {
    renderAs("/");
    await expectBrandSub("模板设计者门户");
  });

  it("redirects the root by role (admin → system-admin portal)", async () => {
    renderAs("/", { name: "系统管理员", email: "admin@example.com", roles: ["管理员"] });
    await expectBrandSub("系统管理员门户");
  });

  it("redirects unauthenticated users to /login", async () => {
    currentUser = null;
    renderAt("/designer");
    expect(await screen.findByRole("button", { name: "登录" })).toBeInTheDocument();
  });

  it("forbids a portal the user's role does not unlock (403)", async () => {
    renderAs("/admin", { name: "李四", email: "lisi@example.com", roles: ["填写者"] });
    expect(await screen.findByText("您没有权限访问该门户")).toBeInTheDocument();
  });

  it.each([
    ["/designer", "模板设计者门户", "创建表单", DESIGNER],
    ["/filler", "表单填写者门户", "表单中心", { name: "李四", email: "lisi@example.com", roles: ["填写者"] } as TestUser],
    ["/approver", "审批人门户", "已审批", { name: "张三", email: "zhangsan@example.com", roles: ["审批者"] } as TestUser],
    ["/admin", "系统管理员门户", "用户管理", { name: "系统管理员", email: "admin@example.com", roles: ["管理员"] } as TestUser],
    ["/ops", "运维人员门户", "导入配置", { name: "运维人员", email: "ops@example.com", roles: ["运维"] } as TestUser],
  ] as const)("%s renders its own shell + nav", async (path, brandSub, navItem, user) => {
    renderAs(path, user as unknown as TestUser);
    await expectBrandSub(brandSub);
    expect(
      screen.getByRole("link", { name: new RegExp(navItem) }),
    ).toBeInTheDocument();
  });

  it("renders /designer/templates (designer landing)", async () => {
    renderAs("/designer/templates");
    expect(await screen.findByText(/没有匹配的模板/)).toBeInTheDocument();
  });

  it("renders /designer/create (entry chooser)", async () => {
    renderAs("/designer/create");
    expect(await screen.findByText("选择一种方式开始设计")).toBeInTheDocument();
    expect(screen.getByText("自然语言创建")).toBeInTheDocument();
    expect(screen.getByText("空白模板")).toBeInTheDocument();
  });

  it("renders /designer/templates/:id (designer workbench)", async () => {
    renderAs("/designer/templates/tpl-1");
    expect(
      await screen.findByRole("heading", { name: "测试模板" }),
    ).toBeInTheDocument();
    expect(screen.getByText("已签出 · 正在编辑")).toBeInTheDocument();
  });

  it("renders the designer workbench full-screen (no Shell sidebar/topbar)", async () => {
    renderAs("/designer/templates/tpl-1");
    await screen.findByRole("heading", { name: "测试模板" });
    expect(document.querySelector(".editor")).toBeInTheDocument();
    expect(document.querySelector(".shell")).not.toBeInTheDocument();
    expect(document.querySelector(".sidebar")).not.toBeInTheDocument();
  });

  it("no longer treats /admin as the designer portal", async () => {
    renderAs("/admin", { name: "系统管理员", email: "admin@example.com", roles: ["管理员"] });
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
