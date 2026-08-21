import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  ApprovalChain,
  ApprovalNode,
  ApproverRule,
  FieldSchema,
  FieldType,
  SectionSchema,
} from "form-engine-core";
import { apiClient, ApiError } from "../../config/api";
import { useAuth } from "../../auth/AuthContext";
import { Button, IconButton } from "../../components";
import { ComponentPalette } from "../../designer/ComponentPalette";
import { DesignCanvas } from "../../designer/DesignCanvas";
import {
  PropertyPanel,
  resolveSelected,
  type PanelSelection,
} from "../../designer/PropertyPanel";
import {
  TemplateMetaDialog,
  type TemplateMeta,
} from "../../designer/TemplateMetaDialog";
import {
  BackIcon,
  CloseIcon,
  EditIcon,
  LockIcon,
  SaveIcon,
  SendIcon,
  TrashIcon,
  UnlockIcon,
} from "../../designer/icons";
import {
  addField,
  addSection,
  createEmptySchema,
  createField,
  createSection,
  duplicateField,
  ensureSection,
  moveField,
  newId,
  removeField,
  removeSection,
  reorderField,
  updateField,
  updateSection,
  type DesignerSchema,
} from "../../designer/schemaModel";
import { resolveStatus } from "../../designer/statusModel";
import type { FormTemplate } from "../../designer/types";
import "./designer.css";

/** Normalize a stored template `schema` JSONB into a DesignerSchema (safe on miss). */
function toDesignerSchema(raw: unknown): DesignerSchema {
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as DesignerSchema).sections)
  ) {
    return raw as DesignerSchema;
  }
  return createEmptySchema();
}

function toRule(rule: unknown): ApproverRule {
  if (rule && typeof rule === "object") {
    const r = rule as ApproverRule;
    if (r.type === "org_structure" || r.type === "role" || r.type === "specific") {
      return r;
    }
  }
  return { type: "specific", userId: "zhangsan" };
}

/** Normalize a stored `approval_chain` JSONB into an ApprovalChain (safe on miss). */
function toChain(raw: unknown): ApprovalChain {
  if (raw && typeof raw === "object" && Array.isArray((raw as ApprovalChain).nodes)) {
    return {
      nodes: (raw as ApprovalChain).nodes.map((n, i) => ({
        id: n.id ?? newId("c"),
        order: n.order ?? i,
        label: n.label,
        approverRule: toRule(n.approverRule),
      })),
    };
  }
  return { nodes: [] };
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export const DesignerPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: me } = useAuth();

  const [template, setTemplate] = useState<FormTemplate | null>(null);
  const [schema, setSchema] = useState<DesignerSchema>(createEmptySchema());
  const [chain, setChain] = useState<ApprovalChain>({ nodes: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [metaOpen, setMetaOpen] = useState(false);
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiClient<FormTemplate>(`/templates/${id}`)
      .then((tpl) => {
        setTemplate(tpl);
        setSchema(toDesignerSchema(tpl.schema));
        setChain(toChain(tpl.approval_chain));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "加载失败");
      })
      .finally(() => setLoading(false));
  }, [id]);

  const isHolder = useMemo(
    () =>
      template != null &&
      me != null &&
      template.locked_by != null &&
      template.locked_by === me.id,
    [template, me],
  );

  // 未持锁即只读（未签出 / 他人锁定 / 已归档）。下传给三大编辑区，让 UI 按只读
  // 渲染；`isHolderRef` 供 schema 变更函数做兜底守卫，避免给每个 useCallback
  // 加依赖（这些回调只调用稳定的 setState）。
  const readonly = !isHolder;
  const isHolderRef = useRef(isHolder);
  isHolderRef.current = isHolder;

  const status = useMemo(() => resolveStatus(template, isHolder), [template, isHolder]);

  // selectedId may be a field OR a section id (canvas/tree both select sections).
  const selected = useMemo<PanelSelection>(
    () => resolveSelected(schema, selectedId),
    [schema, selectedId],
  );

  // ── schema mutations ──

  const handleAddField = useCallback(
    (type: FieldType) => {
      if (!isHolderRef.current) return;
      if (type === "section") {
        handleAddSection();
        return;
      }
      const field = createField(type);
      setSchema((prev) => {
        const withSection = ensureSection(prev);
        const target = withSection.sections[withSection.sections.length - 1].id;
        return addField(withSection, target, field);
      });
      setSelectedId(field.id);
      setDirty(true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleAddFieldToSection = useCallback((sectionId: string) => {
    if (!isHolderRef.current) return;
    const field = createField("text");
    setSchema((prev) => addField(prev, sectionId, field));
    setSelectedId(field.id);
    setDirty(true);
  }, []);

  const handleAddSection = useCallback(() => {
    if (!isHolderRef.current) return;
    const section = createSection();
    setSchema((prev) => addSection(prev, section));
    setSelectedId(section.id);
    setDirty(true);
  }, []);

  const handleMoveField = useCallback(
    (sectionId: string, fieldId: string, delta: -1 | 1) => {
      if (!isHolderRef.current) return;
      setSchema((prev) => moveField(prev, sectionId, fieldId, delta));
      setDirty(true);
    },
    [],
  );

  const handleReorderField = useCallback(
    (sectionId: string, fieldId: string, targetIndex: number) => {
      if (!isHolderRef.current) return;
      setSchema((prev) => reorderField(prev, sectionId, fieldId, targetIndex));
      setDirty(true);
    },
    [],
  );

  const handleRemoveField = useCallback((sectionId: string, fieldId: string) => {
    if (!isHolderRef.current) return;
    setSchema((prev) => removeField(prev, sectionId, fieldId));
    setSelectedId((cur) => (cur === fieldId ? null : cur));
    setDirty(true);
  }, []);

  const handleDuplicateField = useCallback((sectionId: string, fieldId: string) => {
    if (!isHolderRef.current) return;
    setSchema((prev) => duplicateField(prev, sectionId, fieldId));
    setDirty(true);
  }, []);

  const handleRemoveSection = useCallback((sectionId: string) => {
    if (!isHolderRef.current) return;
    setSchema((prev) => removeSection(prev, sectionId));
    setSelectedId((cur) => (cur === sectionId ? null : cur));
    setDirty(true);
  }, []);

  const handleChangeField = useCallback(
    (sectionId: string, fieldId: string, patch: Partial<FieldSchema>) => {
      if (!isHolderRef.current) return;
      setSchema((prev) => updateField(prev, sectionId, fieldId, patch));
      setDirty(true);
    },
    [],
  );

  const handleChangeSection = useCallback(
    (sectionId: string, patch: Partial<SectionSchema>) => {
      if (!isHolderRef.current) return;
      setSchema((prev) => updateSection(prev, sectionId, patch));
      setDirty(true);
    },
    [],
  );

  // ── chain mutations ──

  const handleAddChainNode = useCallback(() => {
    if (!isHolderRef.current) return;
    setChain((prev) => ({
      nodes: [
        ...prev.nodes,
        {
          id: newId("c"),
          order: prev.nodes.length,
          label: "新增审批节点",
          approverRule: { type: "specific", userId: "zhangsan" },
        },
      ],
    }));
    setDirty(true);
  }, []);

  const handleRemoveChainNode = useCallback((id: string) => {
    if (!isHolderRef.current) return;
    setChain((prev) => ({
      nodes: prev.nodes
        .filter((n) => n.id !== id)
        .map((n, i) => ({ ...n, order: i })),
    }));
    setDirty(true);
  }, []);

  const handleMoveChainNode = useCallback((id: string, delta: -1 | 1) => {
    if (!isHolderRef.current) return;
    setChain((prev) => {
      const nodes = [...prev.nodes];
      const i = nodes.findIndex((n) => n.id === id);
      const t = i + delta;
      if (i < 0 || t < 0 || t >= nodes.length) return prev;
      [nodes[i], nodes[t]] = [nodes[t], nodes[i]];
      return { nodes: nodes.map((n, idx) => ({ ...n, order: idx })) };
    });
    setDirty(true);
  }, []);

  const handleChangeChainNode = useCallback(
    (id: string, patch: Partial<ApprovalNode>) => {
      if (!isHolderRef.current) return;
      setChain((prev) => ({
        nodes: prev.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      }));
      setDirty(true);
    },
    [],
  );

  // ── server actions ──

  const runAction = async (
    fn: () => Promise<FormTemplate>,
    successMessage: string,
  ) => {
    setBusy(true);
    setNotice(null);
    try {
      const updated = await fn();
      setTemplate(updated);
      setNotice(successMessage);
      return updated;
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "操作失败";
      setNotice(`操作失败：${msg}`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleSave = () => {
    if (!id) return;
    void runAction(
      () =>
        apiClient<FormTemplate>(`/templates/${id}/schema`, {
          method: "PUT",
          body: JSON.stringify({ schema, approval_chain: chain }),
        }),
      "草稿已保存",
    ).then((updated) => updated && setDirty(false));
  };

  const handlePublish = () => {
    if (!id) return;
    const isRepublish = template?.status === "published";
    void runAction(
      async () => {
        // 发布前先把当前设计落库，再翻状态。publish 只翻状态+清锁、不携带
        // schema——不先 PUT 的话修改只存在于本地 state，发布后再次打开即丢失。
        // 首次发布（草稿）和重发布（已发布）都要落库；未持锁的草稿只读、无
        // 未保存改动，跳过 PUT 直接发布（服务端 publish 对草稿不要求锁）。
        if (isHolder) {
          await apiClient<FormTemplate>(`/templates/${id}/schema`, {
            method: "PUT",
            body: JSON.stringify({ schema, approval_chain: chain }),
          });
        }
        return apiClient<FormTemplate>(`/templates/${id}/publish`, {
          method: "POST",
        });
      },
      isRepublish ? "模板已重新发布" : "模板已发布",
    ).then((updated) => updated && setDirty(false));
  };

  // Delete this template (work order 20). The button only renders for the lock
  // holder, and the server re-checks `template:delete` + the lock — so this is
  // a UI convenience, not the gate. Back to the list after a successful delete.
  // Unlike the other actions this doesn't go through `runAction` (no updated
  // FormTemplate comes back), so busy is toggled inline to keep the toolbar
  // disabled for the duration (a double click would otherwise fire a second
  // DELETE that 404s against the now-deleted row).
  const handleDelete = () => {
    if (!id) return;
    const ok = window.confirm(
      "确定删除此模板吗？未保存的改动将丢失，此操作不可撤销。",
    );
    if (!ok) return;
    setBusy(true);
    setNotice(null);
    apiClient<void>(`/templates/${id}`, { method: "DELETE" })
      .then(() => navigate("/designer/templates"))
      .catch((err: unknown) => {
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "删除失败";
        setNotice(`删除失败：${msg}`);
      })
      .finally(() => setBusy(false));
  };

  // 返回不再自动签入（用户确认，工单 20 后续）：锁保留到显式签入/发布/删除，
  // 否则从设计器签出后回列表，删除按钮会因丢锁而消失。需要释放锁时用工具栏
  // 的「签入」按钮。
  const handleBack = () => {
    navigate("/designer/templates");
  };

  // 签出：获得独占编辑锁（工单 04 前端缺失的入口）。仅未签出的草稿显示。
  const handleCheckout = () => {
    if (!id) return;
    void runAction(
      () => apiClient<FormTemplate>(`/templates/${id}/checkout`, { method: "POST" }),
      "已签出，可开始编辑",
    );
  };

  // 签入：显式释放锁（取代旧「返回自动签入」）。
  const handleCheckin = () => {
    if (!id) return;
    const ok = window.confirm(
      "签入并释放锁？未保存的改动将丢失，其他设计者可开始编辑该模板。",
    );
    if (!ok) return;
    void runAction(
      () => apiClient<FormTemplate>(`/templates/${id}/checkin`, { method: "POST" }),
      "已签入，锁定已释放",
    );
  };

  // 编辑基本信息（BUG-04）：改模板名 / 描述 / 分类。走 PATCH …/meta，同样要求
  // 持锁；成功后用返回的 FormTemplate 覆盖本地 state，顶栏名称即时刷新。
  const handleSaveMeta = (meta: TemplateMeta) => {
    if (!id) return;
    setMetaSaving(true);
    setMetaError(null);
    apiClient<FormTemplate>(`/templates/${id}/meta`, {
      method: "PATCH",
      body: JSON.stringify(meta),
    })
      .then((updated) => {
        setTemplate(updated);
        setMetaOpen(false);
        setNotice("基本信息已更新");
      })
      .catch((err: unknown) => {
        setMetaError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "保存失败",
        );
      })
      .finally(() => setMetaSaving(false));
  };

  if (loading) {
    return <p className="designer-loading">加载中…</p>;
  }

  if (error || !template) {
    return (
      <div className="designer-error">
        <p>{error ?? "模板不存在"}</p>
        <button type="button" onClick={() => navigate("/designer/templates")}>
          返回模板列表
        </button>
      </div>
    );
  }

  return (
    <div className="editor">
      <header className="editor-top">
        <Button
          variant="ghost"
          size="sm"
          icon={<BackIcon />}
          title="返回我的模板"
          onClick={handleBack}
        />

        <div>
          <div className="et-name-row">
            <div className="et-name">{template.name}</div>
            {isHolder && (
              <IconButton
                size="xs"
                label="编辑基本信息"
                onClick={() => {
                  setMetaError(null);
                  setMetaOpen(true);
                }}
              >
                <EditIcon />
              </IconButton>
            )}
          </div>
          <div className="et-sub">
            创建于 {formatDate(template.created_at)} · v{template.version}
            {isHolder ? "（编辑中）" : ""}
            {dirty ? " · 未保存" : ""}
          </div>
        </div>

        <span className={`et-status is-${status.kind}`}>
          <span className="et-dot" />
          {status.text}
        </span>

        <div className="et-actions">
            {/* 动作分组按「生产区 | 结束区」心智模型（BUG-03 grilling 定稿）：
              未签出只给「签出并编辑」一个主动作（开锁 = 打开编辑）；
              签出后「保存草稿 / 发布」为生产动作，「发布」是唯一主色 CTA；
              分隔线右侧为结束动作：「签入」降为次要（上锁 = 结束编辑），
              「删除」danger 隔离在末尾防误触。 */}
          {template.status !== "archived" && template.locked_by == null && (
            <Button
              variant="primary"
              disabled={busy}
              icon={<LockIcon />}
              onClick={handleCheckout}
            >
              签出并编辑
            </Button>
          )}
          {isHolder && template.status === "draft" && (
            <Button
              disabled={busy}
              icon={<SaveIcon />}
              onClick={handleSave}
            >
              保存草稿
            </Button>
          )}
          {isHolder && template.status !== "archived" && (
            <Button
              variant="primary"
              disabled={busy}
              icon={<SendIcon />}
              onClick={handlePublish}
            >
              {template.status === "published" ? "重新发布" : "发布"}
            </Button>
          )}
          {isHolder && (
            <>
              <span className="et-divider" aria-hidden="true" />
              <Button
                disabled={busy}
                variant="primary"
                icon={<UnlockIcon />}
                onClick={handleCheckin}
              >
                签入
              </Button>
              {template.status === "draft" && (
                <Button
                  variant="danger"
                  disabled={busy}
                  icon={<TrashIcon />}
                  onClick={handleDelete}
                >
                  删除
                </Button>
              )}
            </>
          )}
        </div>
      </header>

      {notice && (
        <div className="designer-notice" role="status">
          <span>{notice}</span>
          <button
            type="button"
            className="designer-notice-close"
            aria-label="关闭提示"
            onClick={() => setNotice(null)}
          >
            <CloseIcon width={14} height={14} />
          </button>
        </div>
      )}

      <div className="editor-body">
        <ComponentPalette onAddField={handleAddField} readonly={readonly} />
        <DesignCanvas
          schema={schema}
          templateName={template.name}
          selectedId={selectedId}
          readonly={readonly}
          onSelect={setSelectedId}
          onDropField={handleAddField}
          onRemoveField={handleRemoveField}
          onDuplicateField={handleDuplicateField}
          onRemoveSection={handleRemoveSection}
          onAddSection={handleAddSection}
        />
        <PropertyPanel
          schema={schema}
          selectedId={selectedId}
          selected={selected}
          chain={chain}
          readonly={readonly}
          onChangeField={handleChangeField}
          onChangeSection={handleChangeSection}
          onSelect={setSelectedId}
          onAddFieldToSection={handleAddFieldToSection}
          onRemoveSection={handleRemoveSection}
          onRemoveField={handleRemoveField}
          onMoveField={handleMoveField}
          onReorderField={handleReorderField}
          onAddChainNode={handleAddChainNode}
          onRemoveChainNode={handleRemoveChainNode}
          onMoveChainNode={handleMoveChainNode}
          onChangeChainNode={handleChangeChainNode}
        />
      </div>

      <TemplateMetaDialog
        open={metaOpen}
        initial={{
          name: template.name,
          description: template.description ?? null,
          category: template.category ?? null,
        }}
        busy={metaSaving}
        error={metaError}
        onClose={() => setMetaOpen(false)}
        onSubmit={handleSaveMeta}
      />
    </div>
  );
};
