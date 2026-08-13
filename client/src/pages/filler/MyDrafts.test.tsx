import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MyDrafts } from "./MyDrafts";

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function noContentResponse() {
  return { ok: true, status: 204, json: async () => undefined };
}

const draftList = {
  items: [
    {
      id: "draft-1",
      template_id: "tpl-1",
      user_id: "u-lisi",
      field_values: {},
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      expires_at: "2028-01-01T00:00:00Z",
      template_name: "IT设备申领表",
    },
  ],
  total: 1,
  page: 1,
  pageSize: 100,
};

const mismatchedDraftDetail = {
  id: "draft-1",
  template_id: "tpl-1",
  user_id: "u-lisi",
  field_values: { "fld-001": "李四" },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  expires_at: "2028-01-01T00:00:00Z",
  field_values_migrated: true,
  _orphaned: { "fld-999": "legacy-value" },
  version_mismatch: true,
  template: {
    id: "tpl-1",
    name: "IT设备申领表",
    status: "published",
    schema: { schemaVersion: "1.0.0", sections: [] },
    updated_at: "2026-01-01T00:00:00Z",
  },
};

describe("MyDrafts", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/drafts") || url.includes("/drafts?")) {
          return jsonResponse(draftList);
        }
        if (url.includes("/drafts/draft-1") && url.includes("DELETE")) {
          return noContentResponse();
        }
        if (url.includes("/drafts/draft-1")) {
          return jsonResponse(mismatchedDraftDetail);
        }
        if (url.includes("/instances")) {
          return jsonResponse({
            id: "inst-1",
            template_id: "tpl-1",
            status: "draft",
            field_values: { "fld-001": "李四" },
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("lists drafts", async () => {
    render(
      <MemoryRouter>
        <MyDrafts />
      </MemoryRouter>,
    );

    expect(await screen.findByText("IT设备申领表")).toBeInTheDocument();
  });

  it("shows the orphan-data banner on a version mismatch", async () => {
    render(
      <MemoryRouter>
        <MyDrafts />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "继续填写" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "模板已更新，部分字段内容可能无法匹配",
    );

    // Expand the collapsed orphan panel and confirm the orphaned value shows.
    fireEvent.click(screen.getByRole("button", { name: "查看孤儿数据" }));
    expect(screen.getByText(/fld-999/)).toBeInTheDocument();

    // Continuing still creates a fresh instance from the migrated values.
    fireEvent.click(screen.getByRole("button", { name: "仍要继续填写" }));
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/instances"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("deletes a draft", async () => {
    render(
      <MemoryRouter>
        <MyDrafts />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "删除" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/drafts/draft-1"),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });
});
