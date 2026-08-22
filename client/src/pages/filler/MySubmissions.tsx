import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, ApiError } from "../../config/api";
import { Button, Segmented } from "../../components";
import { Form } from "../../form";
import type {
  InstanceDetail,
  InstanceListItem,
  InstanceListResponse,
} from "./types";
import { formatDate, statusLabel } from "./labels";
import { resolveInstanceSchema } from "./resolveSchema";
import { ApprovalChainSidebar } from "./approvalSidebar";
import "./filler.css";

/** Status filter options for 我的表单 (ADR-0014: an instance IS the draft). */
const STATUS_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "draft", label: "草稿" },
  { value: "submitted", label: "已提交" },
  { value: "in_approval", label: "审批中" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已拒绝" },
  { value: "returned", label: "已退回" },
  { value: "withdrawn", label: "已撤回" },
] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number]["value"];

/**
 * 我的表单 (work order 05) — `GET /instances/my` lists every instance the
 * current user created: in-progress drafts ("继续填写") and submitted ones
 * ("撤回" while still pending, "查看" otherwise). A Segmented control filters by
 * status; clicking a row opens a read-only preview modal (drafts render against
 * the live template, submissions against the frozen snapshot).
 */
export const MySubmissions: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [data, setData] = useState<InstanceListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Read-only preview modal state (fetches the instance detail on open).
  const [previewing, setPreviewing] = useState<InstanceDetail | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: "1", pageSize: "100" });
    if (status !== "all") params.set("status", status);
    apiClient<InstanceListResponse>(`/instances/my?${params.toString()}`)
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "加载失败"),
      )
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const openPreview = async (item: InstanceListItem) => {
    setPreviewError(null);
    setPreviewing(null);
    setPreviewBusy(true);
    try {
      const detail = await apiClient<InstanceDetail>(`/instances/${item.id}`);
      setPreviewing(detail);
    } catch (err: unknown) {
      setPreviewError(
        err instanceof ApiError ? err.message : "加载详情失败，请稍后重试",
      );
    } finally {
      setPreviewBusy(false);
    }
  };

  const withdraw = async (item: InstanceListItem) => {
    setError(null);
    try {
      await apiClient(`/instances/${item.id}/withdraw`, {
        method: "POST",
        body: JSON.stringify({ version: item.version }),
      });
      load();
    } catch (err: unknown) {
      // A 409 means the flow moved under the submitter (an approver already acted
      // or the version is stale) — work order 06: surface the message and reload
      // so the list reflects the new state.
      if (err instanceof ApiError && err.statusCode === 409) {
        load();
      }
      setError(
        err instanceof ApiError ? err.message : "撤回失败，请稍后重试",
      );
    }
  };

  return (
    <div className="filler">
      <div className="filler-toolbar">
        <Segmented<StatusFilter>
          label="按状态筛选"
          options={STATUS_OPTIONS}
          value={status}
          onChange={setStatus}
        />
      </div>

      {error && <p className="filler-error">{error}</p>}
      {loading ? (
        <p className="filler-empty">加载中…</p>
      ) : !data || data.items.length === 0 ? (
        <p className="filler-empty">暂无表单记录</p>
      ) : (
        <table className="filler-table">
          <thead>
            <tr>
              <th>表单</th>
              <th>状态</th>
              <th>更新时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr
                key={item.id}
                className="filler-row"
                onClick={() => void openPreview(item)}
              >
                <td className="filler-name">{item.template_name ?? "—"}</td>
                <td>
                  <span className={`fill-status fill-status--${item.status}`}>
                    {statusLabel(item.status)}
                  </span>
                </td>
                <td>{formatDate(item.updated_at)}</td>
                <td className="filler-actions" onClick={(e) => e.stopPropagation()}>
                  {item.status === "draft" || item.status === "returned" ? (
                    <Button
                      size="sm"
                      onClick={() => navigate(`/filler/instances/${item.id}`)}
                    >
                      {item.status === "returned" ? "重新提交" : "继续填写"}
                    </Button>
                  ) : item.status === "submitted" ||
                    item.status === "in_approval" ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => navigate(`/filler/instances/${item.id}`)}
                      >
                        查看
                      </Button>
                      <Button size="sm" onClick={() => void withdraw(item)}>
                        撤回
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => navigate(`/filler/instances/${item.id}`)}
                    >
                      查看
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(previewing || previewBusy || previewError) && (
        <InstancePreview
          busy={previewBusy}
          error={previewError}
          detail={previewing}
          onClose={() => {
            setPreviewing(null);
            setPreviewError(null);
          }}
        />
      )}
    </div>
  );
};

/** Read-only instance preview modal — same schema resolution as the fill page. */
function InstancePreview({
  busy,
  error,
  detail,
  onClose,
}: {
  busy: boolean;
  error: string | null;
  detail: InstanceDetail | null;
  onClose: () => void;
}) {
  const parsedSchema = useMemo(
    () => (detail ? resolveInstanceSchema(detail) : null),
    [detail],
  );

  return (
    <div
      className="filler-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="表单预览"
      onClick={onClose}
    >
      <div className="filler-modal" onClick={(e) => e.stopPropagation()}>
        <div className="filler-modal-head">
          <div className="filler-modal-title">
            <h3>{detail?.template.name ?? "表单预览"}</h3>
            {detail && (
              <span className={`fill-status fill-status--${detail.status}`}>
                {statusLabel(detail.status)}
              </span>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>

        {error ? (
          <p className="filler-error">{error}</p>
        ) : busy || !detail || !parsedSchema ? (
          <p className="filler-empty">加载中…</p>
        ) : (
          <div className="filler-modal-body">
            <div className="filler-modal-form">
              <Form
                schema={parsedSchema}
                initialValues={detail.field_values}
                readOnly
              />
            </div>
            <aside className="fill-side">
              <ApprovalChainSidebar detail={detail} />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

