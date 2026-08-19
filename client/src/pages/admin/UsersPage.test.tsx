import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UsersPage } from "./UsersPage";

function jsonResponse(body: unknown, status = 200) {
  return { ok: true, status, json: async () => body };
}

function noContentResponse() {
  return { ok: true, status: 204, json: async () => undefined };
}

const users = {
  items: [
    {
      id: "u1",
      name: "张三",
      email: "zhangsan@example.com",
      is_active: true,
      roles: [{ id: "r1", name: "管理员", description: "系统管理员" }],
    },
    {
      id: "u2",
      name: "李四",
      email: "lisi@example.com",
      is_active: false,
      roles: [],
    },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
};

const roles = {
  items: [
    { id: "r1", name: "管理员", description: "系统管理员" },
    { id: "r2", name: "填写者", description: null },
  ],
};

describe("UsersPage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
        const url = String(input);
        const method = (options?.method || "GET").toUpperCase();
        if (/\/roles$/.test(url)) return jsonResponse(roles);
        if (/\/users\/[^/]+\/roles$/.test(url)) return noContentResponse();
        if (/\/users\/[^/]+$/.test(url) && method === "DELETE") return noContentResponse();
        if (/\/users\/[^/]+$/.test(url) && method === "PATCH") {
          return jsonResponse({ ...users.items[0], name: "改名后" });
        }
        if (/\/users$/.test(url) && method === "POST") {
          return jsonResponse(
            {
              id: "u3",
              name: "新用户",
              email: "new@example.com",
              is_active: true,
              roles: [],
            },
            201,
          );
        }
        if (/\/users/.test(url)) return jsonResponse(users);
        throw new Error(`unexpected fetch: ${url} ${method}`);
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  function renderPage() {
    return render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );
  }

  it("lists users with roles, active state, and pagination", async () => {
    renderPage();

    expect(await screen.findByText("张三")).toBeInTheDocument();
    expect(screen.getByText("zhangsan@example.com")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("管理员")).toBeInTheDocument();
    expect(screen.getByText("已停用")).toBeInTheDocument();
    expect(screen.getByText("第 1 / 1 页")).toBeInTheDocument();
  });

  it("assigns roles to a user via the picker", async () => {
    renderPage();
    await screen.findByText("张三");

    fireEvent.click(screen.getAllByRole("button", { name: "分配角色" })[0]);

    await screen.findByRole("dialog", { name: "分配角色" });
    fireEvent.click(screen.getByRole("checkbox", { name: /填写者/ }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/users/u1/roles"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("creates a user through the create dialog", async () => {
    renderPage();
    await screen.findByText("张三");

    fireEvent.click(screen.getByRole("button", { name: "新增用户" }));
    const dialog = await screen.findByRole("dialog", { name: "新增用户" });

    fireEvent.change(within(dialog).getByLabelText("姓名"), {
      target: { value: "新用户" },
    });
    fireEvent.change(within(dialog).getByLabelText("邮箱"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(within(dialog).getByLabelText("初始密码"), {
      target: { value: "secret1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/users"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("新用户"),
        }),
      );
    });
  });

  it("edits a user's name through the edit dialog", async () => {
    renderPage();
    await screen.findByText("张三");

    fireEvent.click(screen.getAllByRole("button", { name: "编辑" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "编辑用户" });

    fireEvent.change(within(dialog).getByLabelText("姓名"), {
      target: { value: "改名后" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/users/u1"),
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });

  it("deletes a user through the confirm dialog", async () => {
    renderPage();
    await screen.findByText("张三");

    fireEvent.click(screen.getAllByRole("button", { name: "删除" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "删除用户" });

    fireEvent.click(within(dialog).getByRole("button", { name: "删除" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/users/u1"),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("applies the search filter via the query button", async () => {
    renderPage();
    await screen.findByText("张三");

    fireEvent.change(screen.getByPlaceholderText("按姓名或邮箱搜索"), {
      target: { value: "张三" },
    });
    fireEvent.click(screen.getByRole("button", { name: "查询" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("search=%E5%BC%A0%E4%B8%89"),
        expect.anything(),
      );
    });
  });
});
