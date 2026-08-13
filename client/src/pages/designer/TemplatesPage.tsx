import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient } from "../../config/api";
import type { TemplateListResponse } from "../../designer/types";
import "./templates.css";

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档",
};

export const TemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [data, setData] = useState<TemplateListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: "1", pageSize: "50" });
    if (search.trim()) params.set("search", search.trim());
    apiClient<TemplateListResponse>(`/templates?${params.toString()}`)
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "加载失败"),
      )
      .finally(() => setLoading(false));
  }, [search]);

  return (
    <div className="templates">
      <div className="templates-toolbar">
        <div className="templates-search">
          <input
            value={search}
            placeholder="搜索模板名称"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button type="button" onClick={() => navigate("/designer/create")}>
          + 新建模板
        </button>
      </div>

      {error ? (
        <p className="templates-error">加载模板失败：{error}</p>
      ) : loading ? (
        <p className="templates-empty">加载中…</p>
      ) : !data || data.items.length === 0 ? (
        <p className="templates-empty">暂无模板，点击“新建模板”开始</p>
      ) : (
        <>
          <table className="templates-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>分类</th>
                <th>状态</th>
                <th>锁定者</th>
                <th>版本</th>
                <th>更新时间</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((tpl) => (
                <tr key={tpl.id}>
                  <td className="tpl-name">{tpl.name}</td>
                  <td>{tpl.category ?? "—"}</td>
                  <td>
                    <span className={`tpl-status tpl-status--${tpl.status}`}>
                      {STATUS_LABEL[tpl.status] ?? tpl.status}
                    </span>
                  </td>
                  <td>{tpl.locked_by_name ?? (tpl.locked_by ? "—" : "未锁定")}</td>
                  <td>v{tpl.version}</td>
                  <td>{formatDate(tpl.updated_at)}</td>
                  <td>
                    <Link to={`/designer/templates/${tpl.id}`}>进入设计</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="templates-total">共 {data.total} 个模板</p>
        </>
      )}
    </div>
  );
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("zh-CN", { hour12: false });
}
