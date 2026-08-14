import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RolesPage } from "./RolesPage";

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function noContentResponse() {
  return { ok: true, status: 204, json: async () => undefined };
}

const roles = {
  items: [
    {
      id: "r1",
      name: "管理员",
      description: "系统管理员",
      permissions: ["admin:manage_roles", "admin:manage_users"],
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "r2",
      name: "填写者",
      description: null,
      permissions: ["filler:fill_forms"],
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
};

const permissions = {
  items: [
    { id: "p1", code: "designer:manage_templates", name: "管理模板", category: "设计器" },
    { id: "p2", code: "filler:fill_forms", name: "填写表单", category: "填写器" },
    { id: "p3", code: "admin:manage_roles", name: "管理角色", category: "管理" },
    { id: "p4", code: "admin:manage_users", name: "管理用户", category: "管理" },
  ],
};

describe("RolesPage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
        const url = String(input);
        const method = (options?.method || "GET").toUpperCase();
        if (url.endsWith("/permissions")) {
          return jsonResponse(permissions);
        }
        if (url.endsWith("/roles") && method === "POST") {
          return jsonResponse({
            id: "r3",
            name: "数据专员",
            description: null,
            permissions: ["admin:manage_users"],
            created_at: "2026-01-02T00:00:00Z",
          });
        }
        if (/\/roles\/r1$/.test(url) && method === "PUT") {
          return jsonResponse({
            id: "r1",
            name: "管理员",
            description: "更新后的描述",
            permissions: ["admin:manage_roles"],
            created_at: "2026-01-01T00:00:00Z",
          });
        }
        if (/\/roles\/r1$/.test(url) && method === "DELETE") {
          return noContentResponse();
        }
        if (url.endsWith("/roles")) {
          return jsonResponse(roles);
        }
        throw new Error(`unexpected fetch: ${url} ${method}`);
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  function renderPage() {
    return render(
      <MemoryRouter>
        <RolesPage />
      </MemoryRouter>,
    );
  }

  it("lists roles with their permission codes", async () => {
    renderPage();

    expect(await screen.findByText("管理员")).toBeInTheDocument();
    expect(screen.getByText("填写者")).toBeInTheDocument();
    expect(screen.getByText("admin:manage_roles")).toBeInTheDocument();
  });

  it("disables save until a name and at least one permission are set", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "新建角色" }));

    const save = screen.getByRole("button", { name: "保存" });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("如：数据专员"), {
      target: { value: "数据专员" },
    });
    expect(save).toBeDisabled(); // still no permission selected

    fireEvent.click(screen.getByRole("checkbox", { name: /admin:manage_users/ }));
    expect(save).toBeEnabled();
  });

  it("creates a role and reloads the list", async () => {
    renderPage();
    await screen.findByText("管理员");

    fireEvent.click(screen.getByRole("button", { name: "新建角色" }));
    fireEvent.change(screen.getByPlaceholderText("如：数据专员"), {
      target: { value: "数据专员" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /admin:manage_users/ }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/roles"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("updates an existing role", async () => {
    renderPage();
    await screen.findByText("管理员");

    fireEvent.click(screen.getAllByRole("button", { name: "编辑" })[0]);

    await screen.findByRole("dialog", { name: "角色编辑" });
    expect(screen.getByDisplayValue("管理员")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/roles/r1"),
        expect.objectContaining({ method: "PUT" }),
      );
    });
  });

  it("deletes a role and removes it from the list", async () => {
    renderPage();
    await screen.findByText("管理员");

    fireEvent.click(screen.getAllByRole("button", { name: "删除" })[0]);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/roles/r1"),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });
});
