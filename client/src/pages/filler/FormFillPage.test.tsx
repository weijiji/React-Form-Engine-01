import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormFillPage } from "./FormFillPage";

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

function instanceDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: "inst-1",
    template_id: "tpl-1",
    template_snapshot: {},
    field_values: { name: "李四" },
    status: "draft",
    current_node_index: 0,
    version: 1,
    submitted_by: "u-lisi",
    submitted_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    approval_records: [],
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

function renderAt() {
  return render(
    <MemoryRouter initialEntries={["/filler/instances/inst-1"]}>
      <Routes>
        <Route path="/filler/instances/:id" element={<FormFillPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("FormFillPage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/instances/inst-1/submit")) {
          return jsonResponse(
            instanceDetail({
              status: "submitted",
              approval_records: [
                {
                  id: "r1",
                  node_id: "n1",
                  node_order: 1,
                  approver_id: "u-zhangsan",
                  approver_name: "张三",
                  action: "pending",
                  acted_at: null,
                },
              ],
            }),
          );
        }
        if (url.includes("/instances/inst-1")) {
          return jsonResponse(instanceDetail());
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("renders the template schema and approval chain", async () => {
    renderAt();

    expect(await screen.findByText("IT设备申领表")).toBeInTheDocument();
    expect(await screen.findByLabelText(/姓名/)).toBeInTheDocument();
    expect(screen.getByText("审批流程")).toBeInTheDocument();
    expect(screen.getByText("直属上级审批")).toBeInTheDocument();
  });

  it("submits field values to /submit", async () => {
    renderAt();
    await screen.findByLabelText(/姓名/);

    fireEvent.click(screen.getByRole("button", { name: "提交" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/instances/inst-1/submit"),
        expect.objectContaining({ method: "POST" }),
      );
    });
    // After a successful submit the instance becomes read-only ("已提交").
    expect(await screen.findByText("已提交")).toBeInTheDocument();
  });

  it("shows a collapsible orphan banner when the template version mismatched (ADR-0004)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/instances/inst-1")) {
          return jsonResponse(
            instanceDetail({
              field_values: { name: "李四" },
              _orphaned: { "fld-removed": "旧值" },
              version_mismatch: true,
            }),
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    renderAt();
    expect(
      await screen.findByText("模板已更新，部分字段内容可能无法匹配"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看孤儿数据" }));
    expect(await screen.findByText(/fld-removed/)).toBeInTheDocument();
  });

  it("lets a returned instance be edited and resubmitted (work order 06)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/instances/inst-1/submit")) {
          return jsonResponse(
            instanceDetail({
              status: "submitted",
              current_node_index: 0,
              version: 3,
              approval_records: [
                {
                  id: "r1",
                  node_id: "n1",
                  node_order: 1,
                  approver_id: "u-zhangsan",
                  approver_name: "张三",
                  action: "pending",
                  comment: "请补充预算编号",
                  acted_at: null,
                },
              ],
            }),
          );
        }
        if (url.includes("/instances/inst-1")) {
          return jsonResponse(
            instanceDetail({
              status: "returned",
              current_node_index: 0,
              version: 2,
              approval_records: [
                {
                  id: "r1",
                  node_id: "n1",
                  node_order: 1,
                  approver_id: "u-zhangsan",
                  approver_name: "张三",
                  action: "returned",
                  comment: "请补充预算编号",
                  acted_at: "2026-01-02T00:00:00Z",
                },
              ],
            }),
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    renderAt();
    await screen.findByLabelText(/姓名/);

    // Returned instances are editable again and submit as 重新提交.
    expect(screen.getByLabelText(/姓名/)).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "重新提交" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重新提交" }));
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/instances/inst-1/submit"),
        expect.objectContaining({ method: "POST" }),
      );
    });
    // Resubmission restarts the chain from node 1 ("已提交", pending again).
    expect(await screen.findByText("已提交")).toBeInTheDocument();
  });
});
