import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormCenter } from "./FormCenter";

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

const forms = {
  items: [
    {
      id: "tpl-1",
      name: "IT设备申领表",
      category: "IT管理",
      description: "申领笔记本电脑等IT设备",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "tpl-2",
      name: "请假申请",
      category: "人事",
      description: null,
      updated_at: "2026-01-02T00:00:00Z",
    },
  ],
  total: 2,
  page: 1,
  pageSize: 100,
};

describe("FormCenter", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/forms")) return jsonResponse(forms);
        if (url.includes("/instances")) {
          return jsonResponse({
            id: "inst-1",
            template_id: "tpl-1",
            status: "draft",
            field_values: {},
            template: {
              id: "tpl-1",
              name: "IT设备申领表",
              status: "published",
              schema: { schemaVersion: "1.0.0", sections: [] },
              updated_at: "2026-01-01T00:00:00Z",
            },
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("lists published forms with name + category", async () => {
    render(
      <MemoryRouter>
        <FormCenter />
      </MemoryRouter>,
    );

    expect(await screen.findByText("IT设备申领表")).toBeInTheDocument();
    expect(screen.getByText("请假申请")).toBeInTheDocument();
    expect(screen.getAllByText("IT管理").length).toBeGreaterThan(0);
  });

  it("creates a draft instance on 填写", async () => {
    render(
      <MemoryRouter>
        <FormCenter />
      </MemoryRouter>,
    );

    const buttons = await screen.findAllByRole("button", { name: "填写" });
    fireEvent.click(buttons[0]);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/instances"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
