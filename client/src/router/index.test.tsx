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
// Portal access is driven by `permissions` (ADR-0010); `roles` only feed the
// user-chip display.
interface TestUser {
  name: string;
  email: string;
  roles: string[];
  permissions: string[];
}

// The five seed roles' permission-code sets (server/src/db/seeds/001_seed_data.ts).
const ALL_PERMS = [
  "template:create", "template:edit", "template:delete", "template:publish",
  "template:export", "template:import", "template:force_unlock",
  "form:fill", "form:submit", "form:withdraw",
  "approval:view_pending", "approval:approve", "approval:reject",
  "approval:return", "approval:transfer",
  "data:view", "data:export", "data:view_stats",
  "admin:manage_roles", "admin:manage_users",
];
const DESIGNER_PERMS = [
  "template:create", "template:edit", "template:delete", "template:publish",
  "template:export", "template:import", "template:force_unlock",
];
const FILLER_PERMS = ["form:fill", "form:submit", "form:withdraw"];
const APPROVER_PERMS = [
  "approval:view_pending", "approval:approve", "approval:reject",
  "approval:return", "approval:transfer",
];
const OPS_PERMS = ["template:import", "template:export", "data:view", "data:view_stats"];

const DESIGNER: TestUser = {
  name: "设计员",
  email: "designer@example.com",
  roles: ["设计者"],
  permissions: DESIGNER_PERMS,
};
const ADMIN: TestUser = {
  name: "系统管理员",
  email: "admin@example.com",
  roles: ["管理员"],
  permissions: ALL_PERMS,
};
const FILLER: TestUser = {
  name: "李四",
  email: "lisi@example.com",
  roles: ["填写者"],
  permissions: FILLER_PERMS,
};
const APPROVER: TestUser = {
  name: "张三",
  email: "zhangsan@example.com",
  roles: ["审批者"],
  permissions: APPROVER_PERMS,
};
const OPS: TestUser = {
  name: "运维人员",
  email: "ops@example.com",
  roles: ["运维"],
  permissions: OPS_PERMS,
};

let currentUser: TestUser | null;

function authBody(u: TestUser) {
  return {
    id: "u-1",
    name: u.name,
    email: u.email,
    roles: u.roles.map((r) => ({ id: `role-${r}`, name: r, description: null })),
    permissions: u.permissions,
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

/** Render a route as a user holding the given permissions (designer by default). */
function renderAs(path: string, user: TestUser = DESIGNER) {
  currentUser = user;
  return renderAt(path);
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
      // Admin pages (work order 09) fetch these on mount; empty lists keep the
      // nav tests independent of the RBAC pages' own data.
      if (
        url.includes("/users") ||
        url.includes("/roles") ||
        url.includes("/permissions")
      ) {
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

describe("permission-driven routing (ADR-0010)", () => {
  it("redirects unauthenticated users to /login", async () => {
    currentUser = null;
    renderAt("/designer");
    expect(await screen.findByRole("button", { name: "登录" })).toBeInTheDocument();
  });

  // Landing = first unlocked nav item in APP_NAV order. 设计者 holds
  // template:publish (→ /admin/templates) and 运维 holds data:view (→
  // /admin/data), so both land on the 系统管理 group before their own domain —
  // the expected consequence of pure page-level gating with the seed codes.
  it.each<[TestUser, string, string]>([
    [ADMIN, "/admin/users", "用户管理"],
    [DESIGNER, "/admin/templates", "模板管理"],
    [FILLER, "/filler/forms", "表单中心"],
    [APPROVER, "/approver/pending", "待审批"],
    [OPS, "/admin/data", "数据管理"],
  ])(
    "root `/` lands on the first nav item the codes unlock",
    async (user, _target, navLabel) => {
      renderAs("/", user);
      await waitFor(() => {
        expect(screen.getByRole("link", { name: new RegExp(navLabel) })).toHaveClass("active");
      });
    },
  );

  it("admin (all codes) sees one unified sidebar with every nav group", async () => {
    renderAs("/admin/users", ADMIN);
    await screen.findByRole("link", { name: /用户管理/ });
    const labels = [
      // 系统管理
      "用户管理", "角色管理", "数据管理", "统计看板", "模板管理",
      // 设计工作台
      "我的模板", " 创建模板", "草稿模板",
      // 表单
      "表单中心", "我的草稿", "我的提交",
      // 审批
      "待审批", "已审批",
      // 运维
      "导入配置", "迁移记录", "模板查看",
      // 通用
      "通知中心",
    ];
    for (const label of labels) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toBeInTheDocument();
    }
    // No portal switcher, no portal brand subtitle.
    expect(document.querySelector(".portal-switcher")).toBeNull();
    expect(document.querySelector(".brand-sub")).toBeNull();
  });

  it("designer sees exactly the nav items their codes unlock", async () => {
    renderAs("/designer/templates", DESIGNER);
    // 模板/通用 之外，设计者还持有 template:publish（→模板管理）与
    // template:import（→导入配置）；页面级门禁下这是预期结果。
    await screen.findByRole("link", { name: /我的模板/ });
    for (const label of [
      "我的模板", " 创建模板", "草稿模板", "模板管理", "导入配置", "通知中心",
    ]) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toBeInTheDocument();
    }
    for (const label of [
      "用户管理", "角色管理", "数据管理", "统计看板",
      "表单中心", "我的草稿", "我的提交",
      "待审批", "已审批", "迁移记录", "模板查看",
    ]) {
      expect(screen.queryByRole("link", { name: new RegExp(label) })).not.toBeInTheDocument();
    }
  });

  // Page-level gating: a page's OWN codes decide access — no area/portal bundle.
  it("forbids ops users from /designer/create (needs template:create) with 403", async () => {
    renderAs("/designer/create", OPS);
    expect(await screen.findByText("您没有权限访问该页面")).toBeInTheDocument();
  });

  it("forbids filler users from /admin/users (needs admin:manage_users) with 403", async () => {
    renderAs("/admin/users", FILLER);
    expect(await screen.findByText("您没有权限访问该页面")).toBeInTheDocument();
  });

  it("detail pages inherit their parent list's codes (ops → 403)", async () => {
    renderAs("/designer/templates/tpl-1", OPS);
    expect(await screen.findByText("您没有权限访问该页面")).toBeInTheDocument();
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
});
