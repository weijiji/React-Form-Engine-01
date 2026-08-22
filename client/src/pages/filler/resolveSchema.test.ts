import { describe, expect, it } from "vitest";
import { resolveInstanceSchema } from "./resolveSchema";
import type { InstanceDetail } from "./types";

/**
 * BUG-10 regression seam (pure function). The server freezes a
 * `template_snapshot = { schema, approval_chain }` at submit
 * (server/src/routes/instances.ts:357-360); a submitted instance must render
 * against the snapshot chain, not the live template chain.
 */
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

/** Live template chain — what the designer has since published. */
const liveChain = {
  nodes: [
    {
      id: "live-node",
      order: 1,
      label: "新链·直属上级",
      approverRule: { type: "org_structure", relation: "direct_manager" },
    },
  ],
};

/** Frozen snapshot chain — what was in effect at submission time. */
const snapshotChain = {
  nodes: [
    {
      id: "snap-node",
      order: 1,
      label: "旧链·指定审批",
      approverRule: { type: "specific", userId: "u-zhangsan" },
    },
  ],
};

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: "inst-1",
    template_id: "tpl-1",
    template_snapshot: { schema, approval_chain: snapshotChain },
    field_values: {},
    status: "in_approval",
    current_node_index: 0,
    version: 3,
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
      approval_chain: liveChain,
      updated_at: "2026-01-01T00:00:00Z",
    },
    ...overrides,
  } as unknown as InstanceDetail;
}

describe("resolveInstanceSchema — approval chain snapshot", () => {
  it("submitted instance resolves the frozen snapshot chain, not the live chain", () => {
    const parsed = resolveInstanceSchema(detail());
    expect(parsed?.approvalChain?.nodes[0].id).toBe("snap-node");
    expect(parsed?.approvalChain?.nodes[0].label).toBe("旧链·指定审批");
  });

  it("draft instance still resolves the live template chain", () => {
    const parsed = resolveInstanceSchema(
      detail({ status: "draft", template_snapshot: {} }),
    );
    expect(parsed?.approvalChain?.nodes[0].id).toBe("live-node");
  });
});
