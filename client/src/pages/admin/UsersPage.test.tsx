import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UsersPage } from "./UsersPage";

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function forbiddenResponse() {
  return {
    ok: false,
    status: 403,
    json: async () => ({
      error: { code: "FORBIDDEN", message: "无权限执行此操作" },
    }),
  };
}

/**
 * BUG-01 (现场): 一个仅持有 admin:manage_users 的「有限权限管理员」打开
 * /admin/users —— 路由守卫放行（页面码已满足），但页面同时拉取 /users 与
 * /roles；GET /roles 需要 admin:manage_roles，故 403，Promise.all 整体
 * reject，整页报「加载用户失败：无权限执行此操作」。
 */
describe("UsersPage — limited admin (only admin:manage_users)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, _options?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/v1/roles")) {
          // 该用户不能列出角色（GET /roles 要求 admin:manage_roles）。
          return forbiddenResponse();
        }
        if (url.startsWith("/api/v1/users")) {
          return jsonResponse({
            items: [
              {
                id: "u1",
                name: "测试管理员",
                email: "u1@example.com",
                is_active: true,
                roles: [],
              },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("用户列表仍应渲染，/roles 的 403 不应让整页失败", async () => {
    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );

    // 期望：用户列表渲染出来；/roles 403 不导致整页错误。
    expect(await screen.findByText("测试管理员")).toBeInTheDocument();
    expect(screen.queryByText(/加载用户失败/)).not.toBeInTheDocument();
  });
});
