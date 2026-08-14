import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UsersPage } from "./UsersPage";

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
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
};

const roles = {
  items: [
    { id: "r1", name: "管理员", description: "系统管理员" },
    { id: "r2", name: "普通用户", description: null },
  ],
};

describe("UsersPage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
        const url = String(input);
        const method = (options?.method || "GET").toUpperCase();
        if (url.includes("/roles")) {
          return jsonResponse(roles);
        }
        if (/\/users\/u1\/roles$/.test(url) && method === "POST") {
          return noContentResponse();
        }
        if (url.includes("/users")) {
          return jsonResponse(users);
        }
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

  it("lists users with their roles and active state", async () => {
    renderPage();

    expect(await screen.findByText("张三")).toBeInTheDocument();
    expect(screen.getByText("zhangsan@example.com")).toBeInTheDocument();
    expect(screen.getByText("管理员")).toBeInTheDocument();
    expect(screen.getByText("已停用")).toBeInTheDocument();
  });

  it("assigns roles to a user via the picker", async () => {
    renderPage();
    await screen.findByText("张三");

    fireEvent.click(screen.getAllByRole("button", { name: "分配角色" })[0]);

    await screen.findByRole("dialog", { name: "分配角色" });
    fireEvent.click(screen.getByRole("checkbox", { name: /普通用户/ }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/users/u1/roles"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
