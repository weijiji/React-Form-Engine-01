import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MySubmissions } from "./MySubmissions";

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

const schema = {
  schemaVersion: "1.0.0",
  sections: [
    {
      id: "s1",
      title: "基本信息",
      fields: [{ id: "name", type: "text", label: "姓名", required: true }],
    },
  ],
};

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

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: "inst-1",
    template_id: "tpl-1",
    template_snapshot: {},
    field_values: { name: "李四" },
    status: "submitted",
    current_node_index: 0,
    version: 2,
    submitted_by: "u-lisi",
    submitted_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    approval_records: [],
    template: {
      id: "tpl-1",
      name: "IT设备申领表",
      status: "published",
      schema,
      approval_chain: null,
      updated_at: "2026-01-01T00:00:00Z",
    },
    ...overrides,
  };
}

describe("MySubmissions", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/instances/inst-1")) return jsonResponse(detail());
        if (url.includes("/instances/my")) return jsonResponse(list());
        if (url.includes("/instances/inst-1/withdraw")) return jsonResponse(list());
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("lists my forms with status badge", async () => {
    render(
      <MemoryRouter>
        <MySubmissions />
      </MemoryRouter>,
    );

    expect(await screen.findByText("IT设备申领表")).toBeInTheDocument();
    expect(document.querySelector(".fill-status--submitted")).toHaveTextContent(
      "已提交",
    );
  });

  it("filters by status via the Segmented control", async () => {
    render(
      <MemoryRouter>
        <MySubmissions />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "草稿" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          "/api/v1/instances/my?page=1&pageSize=100&status=draft",
        ),
        expect.any(Object),
      );
    });
  });

  it("opens a read-only preview modal when a row is clicked", async () => {
    render(
      <MemoryRouter>
        <MySubmissions />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText("IT设备申领表"));

    expect(await screen.findByRole("dialog", { name: "表单预览" })).toBeInTheDocument();
    // Read-only preview renders the field value; the fill page is not entered.
    expect(await screen.findByDisplayValue("李四")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();
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
