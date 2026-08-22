import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

// ── 工单 23 / ADR-0015 决策 2、4：审批链引用检索 + 停用提醒 ───────────────────

interface RefFixture {
  templateId: string;
  templateName: string;
  status: string;
  refTypes: string[];
  roles?: Array<{ id: string; name: string }>;
}

/** 可配置 fetch mock：用户列表 + 角色目录 + 引用检索 + PATCH 停用。 */
function stubApi(refs: RefFixture[]) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.startsWith("/api/v1/roles")) {
        return jsonResponse({ items: [] });
      }
      const refMatch = url.match(
        /^\/api\/v1\/users\/([^/?]+)\/approval-references$/,
      );
      if (refMatch) {
        return jsonResponse({ items: refs });
      }
      if (url.startsWith("/api/v1/users") && method === "PATCH") {
        return jsonResponse({
          id: "u1",
          name: "测试管理员",
          email: "u1@example.com",
          is_active: false,
          roles: [],
        });
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
      throw new Error(`unexpected fetch: ${method} ${url}`);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** 收集 PATCH /users/:id 的调用（引用检索请求除外）。 */
function patchCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(
    ([input, init]) =>
      /\/api\/v1\/users\/[^/?]+$/.test(String(input)) &&
      (init as RequestInit | undefined)?.method === "PATCH",
  );
}

describe("UsersPage — 审批链引用（工单 23 / ADR-0015 决策 2、4）", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("查看引用弹层列出模板 + 状态 + 引用类型 + 设计器跳转链接", async () => {
    stubApi([
      {
        templateId: "tpl-1",
        templateName: "IT设备申领表",
        status: "published",
        refTypes: ["direct"],
      },
      {
        templateId: "tpl-2",
        templateName: "请假表",
        status: "draft",
        refTypes: ["role"],
        roles: [{ id: "r1", name: "审批者" }],
      },
    ]);
    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );

    await screen.findByText("测试管理员");
    await userEvent.click(screen.getByRole("button", { name: "查看引用" }));

    expect(await screen.findByText("IT设备申领表")).toBeInTheDocument();
    expect(screen.getByText("请假表")).toBeInTheDocument();
    expect(screen.getByText("已发布")).toBeInTheDocument();
    expect(screen.getByText("草稿")).toBeInTheDocument();
    expect(screen.getByText("直接引用")).toBeInTheDocument();
    expect(screen.getByText("角色成员（审批者）")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "IT设备申领表" })).toHaveAttribute(
      "href",
      "/designer/templates/tpl-1",
    );
  });

  it("停用无引用：直接 PATCH，不弹确认", async () => {
    const fetchMock = stubApi([]);
    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );

    await screen.findByText("测试管理员");
    await userEvent.click(screen.getByRole("button", { name: "编辑" }));
    await userEvent.click(screen.getByLabelText("启用该账号"));
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(patchCalls(fetchMock)).toHaveLength(1));
    expect(screen.queryByText(/可继续停用/)).not.toBeInTheDocument();
  });

  it("停用有引用：先弹确认（含跳转链接），PATCH 未发；确认后才停用", async () => {
    const fetchMock = stubApi([
      {
        templateId: "tpl-1",
        templateName: "IT设备申领表",
        status: "published",
        refTypes: ["direct"],
      },
    ]);
    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );

    await screen.findByText("测试管理员");
    await userEvent.click(screen.getByRole("button", { name: "编辑" }));
    await userEvent.click(screen.getByLabelText("启用该账号"));
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    // 确认视图出现：提醒 + 引用列表 + 跳转链接；PATCH 尚未发出。
    expect(
      await screen.findByText(/被 1 个模板的审批链引用/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "IT设备申领表" })).toHaveAttribute(
      "href",
      "/designer/templates/tpl-1",
    );
    expect(patchCalls(fetchMock)).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "确认停用" }));
    await waitFor(() => expect(patchCalls(fetchMock)).toHaveLength(1));
  });
});
