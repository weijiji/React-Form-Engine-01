import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, ApiError } from "../../config/api";
import { Button } from "../../components";
import type { PendingApprovalListResponse } from "./types";
import { formatDate, statusLabel } from "../filler/labels";
import "../filler/filler.css";
import "./approver.css";

/**
 * 待审批列表 (work order 06) — `GET /approvals/pending` lists every approval
 * record waiting on the current user (one per chain node, each with the instance
 * and submitter summary). Clicking a row opens the review page
 * (`/approver/approvals/:id`) where the approver acts on the record.
 */
export const ApprovalPendingList: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<PendingApprovalListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiClient<PendingApprovalListResponse>("/approvals/pending")
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "加载失败"),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="filler">
      {error && <p className="filler-error">{error}</p>}
      {loading ? (
        <p className="filler-empty">加载中…</p>
      ) : !data || data.items.length === 0 ? (
        <p className="filler-empty">暂无待审批事项</p>
      ) : (
        <table className="filler-table">
          <thead>
            <tr>
              <th>表单</th>
              <th>提交人</th>
              <th>当前节点</th>
              <th>状态</th>
              <th>更新时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr
                key={item.approval.id}
                className="filler-row"
                onClick={() => navigate(`/approver/approvals/${item.approval.id}`)}
              >
                <td className="filler-name">{item.template_name ?? "—"}</td>
                <td>{item.submitter_name ?? "—"}</td>
                <td>
                  第 {item.approval.node_order} 级
                  {item.approval.transferred_from && (
                    <span className="approver-transferred">已转交</span>
                  )}
                </td>
                <td>
                  <span className={`fill-status fill-status--${item.instance.status}`}>
                    {statusLabel(item.instance.status)}
                  </span>
                </td>
                <td>{formatDate(item.instance.updated_at)}</td>
                <td className="filler-actions" onClick={(e) => e.stopPropagation()}>
                  {/* BUG-14: the button is the row's primary action and must
                      navigate on its own — without an onClick it was a dead
                      gesture shell. stopPropagation on the cell keeps the button
                      click from also bubbling to the row navigation. */}
                  <Button
                    size="sm"
                    onClick={() => navigate(`/approver/approvals/${item.approval.id}`)}
                  >
                    去审批
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
