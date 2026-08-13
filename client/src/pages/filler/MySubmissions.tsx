import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, ApiError } from "../../config/api";
import type { InstanceListItem, InstanceListResponse } from "./types";
import { formatDate, statusLabel } from "./labels";
import "./filler.css";

/**
 * 我的提交 (work order 05) — `GET /instances/my` lists every instance the
 * current user created: in-progress drafts ("继续填写") and submitted ones
 * ("撤回" while still pending, "查看" otherwise).
 */
export const MySubmissions: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [data, setData] = useState<InstanceListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: "1", pageSize: "100" });
    if (status.trim()) params.set("status", status.trim());
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

  const withdraw = async (item: InstanceListItem) => {
    setError(null);
    try {
      await apiClient(`/instances/${item.id}/withdraw`, {
        method: "POST",
        body: JSON.stringify({ version: item.version }),
      });
      load();
    } catch (err: unknown) {
      setError(
        err instanceof ApiError ? err.message : "撤回失败，请稍后重试",
      );
    }
  };

  return (
    <div className="filler">
      <div className="filler-toolbar">
        <select
          className="filler-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">全部状态</option>
          {["draft", "submitted", "in_approval", "approved", "rejected", "returned", "withdrawn"].map(
            (s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ),
          )}
        </select>
      </div>

      {error && <p className="filler-error">{error}</p>}
      {loading ? (
        <p className="filler-empty">加载中…</p>
      ) : !data || data.items.length === 0 ? (
        <p className="filler-empty">暂无提交记录</p>
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
              <tr key={item.id}>
                <td className="filler-name">{item.template_name ?? "—"}</td>
                <td>
                  <span className={`fill-status fill-status--${item.status}`}>
                    {statusLabel(item.status)}
                  </span>
                </td>
                <td>{formatDate(item.updated_at)}</td>
                <td className="filler-actions">
                  {item.status === "draft" ? (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => navigate(`/filler/instances/${item.id}`)}
                    >
                      继续填写
                    </button>
                  ) : item.status === "submitted" ||
                    item.status === "in_approval" ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => navigate(`/filler/instances/${item.id}`)}
                      >
                        查看
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => void withdraw(item)}
                      >
                        撤回
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => navigate(`/filler/instances/${item.id}`)}
                    >
                      查看
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
