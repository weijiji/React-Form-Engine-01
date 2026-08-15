import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../config/api";
import { Badge, Button, IconButton, Input, Segmented } from "../../components";
import type { FormTemplate, TemplateListResponse } from "../../designer/types";
import {
  DocIcon,
  EditIcon,
  EyeIcon,
  MoreIcon,
  PlusIcon,
  SearchIcon,
} from "../../designer/icons";
import "./templates.css";

type StatusFilter = "all" | "published" | "draft";

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "published", label: "已发布" },
  { key: "draft", label: "草稿" },
];

/** Category → card icon tint, mirroring the prototype's `.t-icon.cat-*` set. */
const CATEGORY_TONES: Record<string, string> = {
  人力资源: "cat-hr",
  采购: "cat-ps",
  财务: "cat-fn",
  行政: "cat-xz",
  IT: "cat-it",
  通用: "cat-tg",
};

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

interface TemplateCardProps {
  template: FormTemplate;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onOpen: () => void;
}

const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  menuOpen,
  onToggleMenu,
  onOpen,
}) => {
  const tone = CATEGORY_TONES[template.category ?? ""] ?? "cat-tg";
  return (
    <div
      className="tpl-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="t-head">
        <span className={`t-icon ${tone}`} aria-hidden="true">
          <DocIcon />
        </span>
        <div className="t-head-right">
          {statusBadge(template.status)}
          <span className="menu-wrap">
            <IconButton
              active={menuOpen}
              label="更多操作"
              aria-expanded={menuOpen}
              onClick={(e) => {
                e.stopPropagation();
                onToggleMenu();
              }}
            >
              <MoreIcon />
            </IconButton>
            {menuOpen && (
              <div className="tpl-menu">
                <button
                  type="button"
                  className="menu-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen();
                  }}
                >
                  <EditIcon />
                  编辑
                </button>
                <button
                  type="button"
                  className="menu-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen();
                  }}
                >
                  <EyeIcon />
                  查看详情
                </button>
              </div>
            )}
          </span>
        </div>
      </div>
      <h3>{template.name}</h3>
      <p className="t-desc">{template.description || "暂无描述"}</p>
      <div className="t-meta">
        <span>
          {template.category ?? "未分类"} · {fieldCount(template.schema)} 个字段
        </span>
        <span>更新于 {formatUpdated(template.updated_at)}</span>
      </div>
    </div>
  );
};

export const TemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [data, setData] = useState<TemplateListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    // Debounce the keystroke-driven search so the API isn't hit per character.
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ page: "1", pageSize: "50" });
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

  // Collapse the open "more" menu on outside click / Escape.
  useEffect(() => {
    if (openMenuId == null) return;
    const onDocClick = (e: MouseEvent) => {
      if (!(e.target as Element).closest(".menu-wrap")) setOpenMenuId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenuId(null);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenuId]);

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
        <Button
          variant="primary"
          icon={<PlusIcon />}
          onClick={() => navigate("/designer/create")}
        >
          新建表单
        </Button>
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
          <p>调整筛选条件，或创建一个新的表单模板。</p>
          <Button
            variant="primary"
            className="empty-cta"
            onClick={() => navigate("/designer/create")}
          >
            新建表单
          </Button>
        </div>
      ) : (
        <div className="tpl-grid">
          {items.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              menuOpen={openMenuId === tpl.id}
              onToggleMenu={() =>
                setOpenMenuId((cur) => (cur === tpl.id ? null : tpl.id))
              }
              onOpen={() => navigate(`/designer/templates/${tpl.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
