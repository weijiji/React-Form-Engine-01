import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApprovalChainSidebar } from "./approvalSidebar";
import type { InstanceDetail } from "./types";

/**
 * BUG-10 regression seam (user-visible symptom). For a submitted instance the
 * sidebar must render the frozen snapshot chain and match `approval_records`
 * against snapshot node ids — not the live template chain.
 */
const liveChain = {
  nodes: [{ id: "live-node", order: 1, label: "新链节点" }],
};
const snapshotChain = {
  nodes: [{ id: "snap-node", order: 1, label: "旧链节点" }],
};

function detail() {
  return {
    id: "inst-1",
    template_id: "tpl-1",
    template_snapshot: { schema: {}, approval_chain: snapshotChain },
    field_values: {},
    status: "in_approval",
    current_node_index: 0,
    version: 3,
    submitted_by: "u-lisi",
    submitted_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    approval_records: [
      {
        id: "rec-1",
        instance_id: "inst-1",
        node_id: "snap-node",
        node_order: 1,
        approver_id: "u-zhangsan",
        approver_name: "张三",
        action: "approved",
        acted_at: "2026-01-02T00:00:00Z",
      },
    ],
    template: {
      id: "tpl-1",
      name: "IT设备申领表",
      status: "published",
      schema: {},
      approval_chain: liveChain,
      updated_at: "2026-01-01T00:00:00Z",
    },
  } as unknown as InstanceDetail;
}

describe("ApprovalChainSidebar — frozen chain", () => {
  it("renders the snapshot chain and matches records for a submitted instance", () => {
    render(<ApprovalChainSidebar detail={detail()} />);

    // Snapshot node renders, live node does not leak in.
    expect(screen.getByText("旧链节点")).toBeInTheDocument();
    expect(screen.queryByText("新链节点")).not.toBeInTheDocument();
    // The record frozen at submit time attaches to the snapshot node.
    expect(screen.getByText("张三")).toBeInTheDocument();
  });
});
