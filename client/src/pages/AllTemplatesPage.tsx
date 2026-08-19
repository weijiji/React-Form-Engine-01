import { useEffect, useState } from "react";
import { apiClient } from "../config/api";
import { Badge, Input, Segmented } from "../components";
import type { FormTemplate, TemplateListResponse } from "../designer/types";
import { DocIcon, SearchIcon } from "../designer/icons";
import "./designer/templates.css";

/**
 * 只读「全部模板」视图（ADR-0012，BUG-06）。挂载于 `/admin/templates`（模板管理）
 * 与 `/ops/templates`（模板查看），两者都持 `template:view_all`。与「我的模板」
 * （TemplatesPage）不同，这里固定 `scope=all`，且不含新建/编辑/删除等写操作入口。
 */

type StatusFilter = "all" | "published" | "draft";

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "published", label: "已发布" },
  { key: "draft", label: "草稿" },
];

/** Count fields across every section of a stored `schema` JSONB (0 on miss). */
function fieldCount(schema: unknown): number {
  const s = schema as { sections?: Array<{ fields?: unknown[] }> } | undefined;
  if (!s || !Array.isArray(s.sections)) return 0;
  return s.sections.reduce(
    (n, sec) => n + (Array.isArray(sec.fields) ? sec.fields.length : 0),
    0,
  );
}

/** `YYYY-MM-DD` for the card's "更新于 …" meta. */
function formatUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function statusBadge(status: string): React.ReactNode {
  if (status === "published") {
    return (
      <Badge color="green" dot>
        已发布
      </Badge>
    );
  }
  if (status === "draft") {
    return (
      <Badge color="amber" dot>
        草稿
      </Badge>
    );
  }
  return (
    <Badge color="gray" dot>
      已归档
    </Badge>
  );
}

const ReadonlyCard: React.FC<{ template: FormTemplate }> = ({ template }) => {
  return (
    <div className="tpl-card">
      <div className="t-head">
        <div>
          <h3>{template.name}</h3>
        </div>
        <div className="t-head-right">{statusBadge(template.status)}</div>
      </div>
      <p className="t-desc">{template.description || "暂无描述"}</p>
      <div className="t-meta">
        <span>
          创建人：{template.created_by_name ?? "—"} ·{" "}
          {template.category ?? "未分类"} · {fieldCount(template.schema)} 个字段
        </span>
        <span>更新于 {formatUpdated(template.updated_at)}</span>
      </div>
    </div>
  );
};

export const AllTemplatesPage: React.FC = () => {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [data, setData] = useState<TemplateListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Debounce the keystroke-driven search so the API isn't hit per character.
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        scope: "all",
        page: "1",
        pageSize: "100",
      });
      if (status !== "all") params.set("status", status);
      if (search.trim()) params.set("search", search.trim());
      apiClient<TemplateListResponse>(`/templates?${params.toString()}`)
        .then(setData)
        .catch((err: unknown) =>
          setError(err instanceof Error ? err.message : "加载失败"),
        )
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [search, status]);

  const items = data?.items ?? [];

  return (
    <div className="templates">
      <div className="toolbar">
        <Segmented
          options={STATUS_FILTERS.map((f) => ({ value: f.key, label: f.label }))}
          value={status}
          onChange={setStatus}
          label="状态筛选"
        />
        <Input
          className="tb-search"
          size="sm"
          icon={<SearchIcon />}
          value={search}
          placeholder="搜索模板名称…"
          aria-label="搜索模板名称"
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error ? (
        <p className="templates-error">加载模板失败：{error}</p>
      ) : loading ? (
        <p className="templates-empty">加载中…</p>
      ) : items.length === 0 ? (
        <div className="empty">
          <div className="empty-ico">
            <DocIcon />
          </div>
          <h3>没有匹配的模板</h3>
          <p>调整筛选条件后重试。</p>
        </div>
      ) : (
        <div className="tpl-grid">
          {items.map((tpl) => (
            <ReadonlyCard key={tpl.id} template={tpl} />
          ))}
        </div>
      )}
    </div>
  );
};
