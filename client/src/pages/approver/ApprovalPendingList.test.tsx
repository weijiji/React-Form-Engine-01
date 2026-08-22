import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalPendingList } from "./ApprovalPendingList";

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

/** The target route renders the navigated record id so tests can assert it. */
function ApprovalTarget() {
  const { id = "" } = useParams();
  return <div>审批详情-{id}</div>;
}

const pendingItem = {
  approval: {
    id: "rec-1",
    node_id: "n1",
    node_order: 1,
    approver_id: "u-zhangsan",
    approver_name: "张三",
    action: "pending",
    comment: null,
    transferred_from: null,
    acted_at: null,
  },
  instance: {
    id: "inst-1",
    template_id: "tpl-1",
    status: "submitted",
    current_node_index: 0,
    submitted_by: "u-lisi",
    submitted_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  template_name: "IT设备申领表",
  submitter_name: "李四",
};

function list(overrides: Record<string, unknown> = {}) {
  return { items: [pendingItem], total: 1, ...overrides };
}

function renderList() {
  return render(
    <MemoryRouter initialEntries={["/approver/pending"]}>
      <Routes>
        <Route path="/approver/pending" element={<ApprovalPendingList />} />
        <Route path="/approver/approvals/:id" element={<ApprovalTarget />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ApprovalPendingList", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/approvals/pending")) return jsonResponse(list());
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("lists the pending approvals with template, submitter and status", async () => {
    renderList();

    expect(await screen.findByText("IT设备申领表")).toBeInTheDocument();
    expect(screen.getByText("李四")).toBeInTheDocument();
    expect(screen.getByText("第 1 级")).toBeInTheDocument();
    expect(document.querySelector(".fill-status--submitted")).toHaveTextContent(
      "已提交",
    );
  });

  it("navigates to the review page when a row is clicked", async () => {
    renderList();

    fireEvent.click(await screen.findByText("IT设备申领表"));

    expect(await screen.findByText("审批详情-rec-1")).toBeInTheDocument();
  });

  it("BUG-14: navigates to the review page when the 去审批 button is clicked", async () => {
    renderList();

    // The button is the row's primary action. It had no onClick, and the
    // actions cell's stopPropagation swallowed the row navigation — so the
    // click did nothing. Clicking the button must land on the review page.
    fireEvent.click(await screen.findByRole("button", { name: "去审批" }));

    expect(await screen.findByText("审批详情-rec-1")).toBeInTheDocument();
  });

  it("shows the empty state when there is nothing to approve", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/approvals/pending")) return jsonResponse(list({ items: [], total: 0 }));
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    renderList();
    expect(await screen.findByText("暂无待审批事项")).toBeInTheDocument();
  });
});
