import type { ApprovalRecordSummary, InstanceDetail } from "./types";
import { ACTION_LABEL, formatDate } from "./labels";

/**
 * Approval-chain sidebar for an instance detail (work order 05). Shared by the
 * fill page (FormFillPage) and the read-only preview modal (MySubmissions).
 * Renders the chain nodes with the resolved approver and action badge; shows a
 * hint until the record resolves at submit time.
 */
export function ApprovalChainSidebar({ detail }: { detail: InstanceDetail }) {
  // A draft edits the live template chain; a submitted instance renders the
  // frozen snapshot chain so approval records (matched by node_id) stay aligned
  // with the chain that was in effect at submit time (BUG-10).
  const isDraft = detail.status === "draft";
  const chain = (
    isDraft
      ? detail.template.approval_chain
      : (detail.template_snapshot as { approval_chain?: unknown } | null | undefined)
          ?.approval_chain ?? detail.template.approval_chain
  ) as
    | { nodes?: Array<{ id: string; order: number; label?: string }> }
    | null
    | undefined;
  const nodes = chain?.nodes ?? [];
  const recordByNode = new Map<string, ApprovalRecordSummary>(
    (detail.approval_records ?? []).map((r) => [r.node_id, r]),
  );

  return (
    <div className="chain-side">
      <h3 className="chain-side-title">审批流程</h3>
      {nodes.length === 0 ? (
        <p className="chain-side-empty">该表单无需审批</p>
      ) : (
        <ol className="chain-side-list">
          {nodes.map((node) => {
            const record = recordByNode.get(node.id);
            return (
              <li key={node.id} className="chain-side-node">
                <span className="chain-side-dot" aria-hidden="true">
                  {node.order}
                </span>
                <div className="chain-side-card">
                  <div className="chain-side-label">
                    {node.label ?? `第 ${node.order} 级审批`}
                  </div>
                  <div className="chain-side-approver">
                    {record?.approver_name ?? (record ? "—" : "提交后解析")}
                  </div>
                  {record && (
                    <div className="chain-side-action">
                      <span
                        className={`chain-side-badge chain-side-badge--${record.action}`}
                      >
                        {ACTION_LABEL[record.action] ?? record.action}
                      </span>
                      {record.acted_at && (
                        <span className="chain-side-time">
                          {formatDate(record.acted_at)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
