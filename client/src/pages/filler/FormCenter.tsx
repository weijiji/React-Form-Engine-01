import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../config/api";
import type { FormListResponse, FormSummary, InstanceDetail } from "./types";
import { formatDate } from "./labels";
import "./filler.css";

/**
 * 表单中心 (work order 05) — the filler's landing page. Lists published forms
 * (GET /api/v1/forms) with search + category filter. "填写" creates a draft
 * FormInstance (POST /api/v1/instances) and jumps into the fill page.
 */
export const FormCenter: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [data, setData] = useState<FormListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: "1", pageSize: "100" });
    if (search.trim()) params.set("search", search.trim());
    if (category.trim()) params.set("category", category.trim());
    apiClient<FormListResponse>(`/forms?${params.toString()}`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search, category]);

  const startFilling = async (form: FormSummary) => {
    setStarting(form.id);
    setError(null);
    try {
      const instance = await apiClient<InstanceDetail>("/instances", {
        method: "POST",
        body: JSON.stringify({ template_id: form.id }),
      });
      navigate(`/filler/instances/${instance.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "创建失败");
      setStarting(null);
    }
  };

  const categories = Array.from(
    new Set((data?.items ?? []).map((f) => f.category).filter(Boolean)),
  ) as string[];

  return (
    <div className="filler">
      <div className="filler-toolbar">
        <input
          className="filler-search"
          value={search}
          placeholder="搜索表单名称"
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="filler-select"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">全部分类</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="filler-error">加载失败：{error}</p>}
      {loading ? (
        <p className="filler-empty">加载中…</p>
      ) : !data || data.items.length === 0 ? (
        <p className="filler-empty">暂无可填写的表单</p>
      ) : (
        <ul className="form-grid">
          {data.items.map((form) => (
            <li key={form.id} className="form-card">
              <div className="form-card-head">
                <h3 className="form-card-name">{form.name}</h3>
                {form.category && (
                  <span className="form-card-cat">{form.category}</span>
                )}
              </div>
              {form.description && (
                <p className="form-card-desc">{form.description}</p>
              )}
              <div className="form-card-foot">
                <span className="form-card-meta">
                  更新于 {formatDate(form.updated_at)}
                </span>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={starting === form.id}
                  onClick={() => void startFilling(form)}
                >
                  {starting === form.id ? "创建中…" : "填写"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
