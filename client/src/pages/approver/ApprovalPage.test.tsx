import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthContext";
import { ApprovalPage } from "./ApprovalPage";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
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

const approvalChain = {
  nodes: [
    {
      id: "n1",
      order: 1,
      label: "直属上级审批",
      approverRule: { type: "org_structure", relation: "direct_manager" },
    },
  ],
};

const pendingApproval = {
  id: "rec-1",
  node_id: "n1",
  node_order: 1,
  approver_id: "u-zhangsan",
  approver_name: "张三",
  action: "pending",
  comment: null,
  transferred_from: null,
  acted_at: null,
};

function me() {
  return {
    id: "u-zhangsan",
    name: "张三",
    email: "zhangsan@example.com",
    roles: [{ id: "r-approver", name: "审批者", description: null }],
    permissions: [
      "approval:view_pending",
      "approval:approve",
      "approval:reject",
      "approval:return",
      "approval:transfer",
    ],
  };
}

function instance(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "inst-1",
    template_id: "tpl-1",
    template_snapshot: { schema, approval_chain: approvalChain },
    field_values: { name: "李四" },
    status,
    current_node_index: 0,
    version: 2,
    submitted_by: "u-lisi",
    submitted_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    approval_records: [{ ...pendingApproval }],
    template: {
      id: "tpl-1",
      name: "IT设备申领表",
      status: "published",
      schema,
      approval_chain: approvalChain,
      updated_at: "2026-01-01T00:00:00Z",
    },
    ...overrides,
  };
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    approval: { ...pendingApproval },
    instance: instance("submitted"),
    ...overrides,
  };
}

/** Render the page inside the auth + router providers. */
function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/approver/approvals/rec-1"]}>
        <Routes>
          <Route path="/approver/approvals/:id" element={<ApprovalPage />} />
          <Route path="/approver/pending" element={<div>待审批列表</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("ApprovalPage (work order 06)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/auth/me")) return jsonResponse(me());
        if (url.includes("/approvals/rec-1")) return jsonResponse(detail());
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("renders the read-only form and the approval chain", async () => {
    renderPage();

    expect(await screen.findByText("IT设备申领表")).toBeInTheDocument();
    // Read-only: the submitted value renders but the field is not editable.
    expect(await screen.findByDisplayValue("李四")).toBeInTheDocument();
    expect(screen.getByText("审批流程")).toBeInTheDocument();
    expect(screen.getByText("直属上级审批")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "同意" })).toBeInTheDocument();
  });

  it("approves through the confirm dialog and reports the node handled", async () => {
    const current = { value: detail() };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/auth/me")) return jsonResponse(me());
        if (url.includes("/approvals/rec-1/approve")) {
          current.value = detail({
            approval: { ...pendingApproval, action: "approved", acted_at: "2026-01-02T00:00:00Z" },
            instance: instance("approved", {
              version: 3,
              approval_records: [{ ...pendingApproval, action: "approved", acted_at: "2026-01-02T00:00:00Z" }],
            }),
          });
          return jsonResponse(current.value);
        }
        if (url.includes("/approvals/rec-1")) return jsonResponse(current.value);
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "同意" }));

    const dialog = screen.getByRole("dialog", { name: "确认同意" });
    fireEvent.click(within(dialog).getByRole("button", { name: "同意" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/approvals/rec-1/approve"),
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(await screen.findByText("该节点已处理，无需进一步操作")).toBeInTheDocument();
  });

  it("blocks reject until a comment is provided, then posts it", async () => {
    const current = { value: detail() };
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/me")) return jsonResponse(me());
      if (url.includes("/approvals/rec-1/reject")) {
        current.value = detail({
          approval: { ...pendingApproval, action: "rejected", comment: "预算不足", acted_at: "2026-01-02T00:00:00Z" },
          instance: instance("rejected", {
            version: 3,
            approval_records: [{ ...pendingApproval, action: "rejected", comment: "预算不足", acted_at: "2026-01-02T00:00:00Z" }],
          }),
        });
        return jsonResponse(current.value);
      }
      if (url.includes("/approvals/rec-1")) return jsonResponse(current.value);
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", mockFetch);

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "拒绝" }));

    const dialog = screen.getByRole("dialog", { name: "确认拒绝" });
    const confirm = within(dialog).getByRole("button", { name: "拒绝" });
    expect(confirm).toBeDisabled(); // comment required

    fireEvent.change(within(dialog).getByPlaceholderText("请填写拒绝原因"), {
      target: { value: "预算不足" },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/approvals/rec-1/reject"),
        expect.objectContaining({ body: expect.stringContaining("预算不足") }),
      );
    });
  });

  it("transfers the node to another approver via the target picker", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/auth/me")) return jsonResponse(me());
        if (url.includes("/approvals/options")) {
          return jsonResponse({ users: [{ id: "u-admin", name: "管理员" }] });
        }
        if (url.includes("/approvals/rec-1/transfer")) {
          return jsonResponse(
            detail({
              approval: { ...pendingApproval, approver_id: "u-admin", transferred_from: "u-zhangsan" },
            }),
          );
        }
        if (url.includes("/approvals/rec-1")) return jsonResponse(detail());
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "转交" }));

    const dialog = await screen.findByRole("dialog", { name: "转交审批" });
    await within(dialog).findByText("管理员");
    fireEvent.change(within(dialog).getByRole("combobox"), {
      target: { value: "u-admin" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "转交" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/approvals/rec-1/transfer"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("shows an explicit conflict hint on 409 and auto-refreshes the detail", async () => {
    let handled = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/auth/me")) return jsonResponse(me());
        if (url.includes("/approvals/rec-1/approve")) {
          return jsonResponse(
            { error: { code: "APPROVAL_NOT_PENDING", message: "该审批已被处理，请刷新" } },
            409,
          );
        }
        if (url.includes("/approvals/rec-1")) {
          if (handled) {
            return jsonResponse(
              detail({
                approval: { ...pendingApproval, action: "approved", acted_at: "2026-01-02T00:00:00Z" },
                instance: instance("approved", { version: 3 }),
              }),
            );
          }
          handled = true;
          return jsonResponse(detail());
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "同意" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "确认同意" })).getByRole("button", {
        name: "同意",
      }),
    );

    // Explicit conflict hint from the 409.
    expect(await screen.findByText(/该审批已被处理/)).toBeInTheDocument();
    // The auto-refresh reloads the detail, which now shows the record handled.
    expect(await screen.findByText("该节点已处理，无需进一步操作")).toBeInTheDocument();
  });
});
