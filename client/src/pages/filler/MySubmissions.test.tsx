import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MySubmissions } from "./MySubmissions";

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function list(overrides: Record<string, unknown> = {}) {
  return {
    items: [
      {
        id: "inst-1",
        template_id: "tpl-1",
        template_snapshot: {},
        field_values: {},
        status: "submitted",
        current_node_index: 0,
        version: 2,
        submitted_by: "u-lisi",
        submitted_at: "2026-01-01T00:00:00Z",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        template_name: "IT设备申领表",
      },
    ],
    total: 1,
    page: 1,
    pageSize: 100,
    ...overrides,
  };
}

describe("MySubmissions", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/instances/my")) return jsonResponse(list());
        if (url.includes("/instances/inst-1/withdraw")) return jsonResponse(list());
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("lists my submissions with status", async () => {
    render(
      <MemoryRouter>
        <MySubmissions />
      </MemoryRouter>,
    );

    expect(await screen.findByText("IT设备申领表")).toBeInTheDocument();
    // "已提交" also appears as a filter option in the toolbar, so assert the
    // status badge specifically.
    expect(document.querySelector(".fill-status--submitted")).toHaveTextContent(
      "已提交",
    );
  });

  it("withdraws a pending submission", async () => {
    render(
      <MemoryRouter>
        <MySubmissions />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "撤回" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/instances/inst-1/withdraw"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("offers 继续填写 for a draft instance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/instances/my")) {
          return jsonResponse(
            list({ items: [{ ...list().items[0], id: "inst-2", status: "draft" }] }),
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    render(
      <MemoryRouter>
        <MySubmissions />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("button", { name: "继续填写" }),
    ).toBeInTheDocument();
  });
});
