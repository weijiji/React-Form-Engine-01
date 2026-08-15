import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, ApiError } from "../../config/api";
import { Button } from "../../components";
import type { DraftDetail, DraftListItem, DraftListResponse, InstanceDetail } from "./types";
import { formatDate } from "./labels";
import "./filler.css";

/**
 * 我的草稿 (work order 05) — the standalone `drafts` list (CONTEXT.md "Draft",
 * a separate entity from a draft-status FormInstance). "继续填写" resumes a
 * draft: if the template changed since the draft was saved, the backend's
 * best-effort fieldId migration (ADR-0004) orphans removed fields, which we
 * surface as a yellow banner + collapsed orphan panel before creating a fresh
 * FormInstance to continue editing.
 */
export const MyDrafts: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<DraftListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resuming, setResuming] = useState<DraftDetail | null>(null);
  const [orphansOpen, setOrphansOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiClient<DraftListResponse>("/drafts?page=1&pageSize=100")
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "加载失败"),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const inspectDraft = async (draft: DraftListItem) => {
    setError(null);
    setResuming(null);
    setOrphansOpen(false);
    try {
      const detail = await apiClient<DraftDetail>(`/drafts/${draft.id}`);
      if (detail.version_mismatch) {
        setResuming(detail);
      } else {
        await continueFromDraft(detail);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "恢复草稿失败");
    }
  };

  const continueFromDraft = async (detail: DraftDetail) => {
    setError(null);
    try {
      const instance = await apiClient<InstanceDetail>("/instances", {
        method: "POST",
        body: JSON.stringify({
          template_id: detail.template_id,
          field_values: detail.field_values,
        }),
      });
      navigate(`/filler/instances/${instance.id}`);
    } catch (err: unknown) {
      setError(
        err instanceof ApiError ? err.message : "创建实例失败，请稍后重试",
      );
    }
  };

  const discard = async (draft: DraftListItem) => {
    setError(null);
    try {
      await apiClient(`/drafts/${draft.id}`, { method: "DELETE" });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "删除草稿失败");
    }
  };

  return (
    <div className="filler">
      {error && <p className="filler-error">{error}</p>}

      {resuming && (
        <div className="orphan-banner" role="alert">
          <div className="orphan-banner-head">
            <strong>模板已更新，部分字段内容可能无法匹配</strong>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOrphansOpen((v) => !v)}
            >
              {orphansOpen ? "收起" : "查看孤儿数据"}
            </Button>
          </div>
          {orphansOpen && (
            <pre className="orphan-banner-data">
              {JSON.stringify(resuming._orphaned ?? {}, null, 2)}
            </pre>
          )}
          <div className="orphan-banner-actions">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void continueFromDraft(resuming)}
            >
              仍要继续填写
            </Button>
            <Button size="sm" onClick={() => setResuming(null)}>
              取消
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="filler-empty">加载中…</p>
      ) : !data || data.items.length === 0 ? (
        <p className="filler-empty">暂无草稿</p>
      ) : (
        <table className="filler-table">
          <thead>
            <tr>
              <th>表单</th>
              <th>保存时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((draft) => (
              <tr key={draft.id}>
                <td className="filler-name">{draft.template_name ?? "—"}</td>
                <td>{formatDate(draft.updated_at)}</td>
                <td className="filler-actions">
                  <Button size="sm" onClick={() => void inspectDraft(draft)}>
                    继续填写
                  </Button>
                  <Button size="sm" onClick={() => void discard(draft)}>
                    删除
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
