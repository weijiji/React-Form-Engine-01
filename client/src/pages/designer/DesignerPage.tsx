import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ApprovalChain, FieldSchema, FieldType } from "form-engine-core";
import { apiClient, ApiError } from "../../config/api";
import { ComponentPalette } from "../../designer/ComponentPalette";
import { DesignCanvas } from "../../designer/DesignCanvas";
import { PropertyPanel } from "../../designer/PropertyPanel";
import {
  addField,
  addSection,
  createEmptySchema,
  createField,
  createSection,
  ensureSection,
  findField,
  moveField,
  removeField,
  reorderField,
  updateField,
  updateSection,
  type DesignerSchema,
} from "../../designer/schemaModel";
import type { FormTemplate, User } from "../../designer/types";
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

export const DesignerPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [template, setTemplate] = useState<FormTemplate | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [schema, setSchema] = useState<DesignerSchema>(createEmptySchema());
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      apiClient<User>("/me"),
      apiClient<FormTemplate>(`/templates/${id}`),
    ])
      .then(([user, tpl]) => {
        setMe(user);
        setTemplate(tpl);
        setSchema(toDesignerSchema(tpl.schema));
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

  const badge = useMemo(() => {
    if (!template) return null;
    if (isHolder) return { label: "编辑中", tone: "editing" as const };
    if (template.locked_by)
      return {
        label: `已锁定 - ${template.locked_by_name ?? "他人"}`,
        tone: "locked" as const,
      };
    return { label: "未签出", tone: "free" as const };
  }, [template, isHolder]);

  const selected = useMemo(() => {
    if (!selectedFieldId) return null;
    const found = findField(schema, selectedFieldId);
    return found ?? null;
  }, [schema, selectedFieldId]);

  // ── schema mutations ──

  const handleAddField = useCallback((type: FieldType) => {
    setSchema((prev) => {
      const withSection = ensureSection(prev);
      const target = withSection.sections[withSection.sections.length - 1].id;
      return addField(withSection, target, createField(type));
    });
    setDirty(true);
  }, []);

  const handleMoveField = useCallback(
    (sectionId: string, fieldId: string, delta: -1 | 1) => {
      setSchema((prev) => moveField(prev, sectionId, fieldId, delta));
      setDirty(true);
    },
    [],
  );

  const handleReorderField = useCallback(
    (sectionId: string, fieldId: string, targetIndex: number) => {
      setSchema((prev) => reorderField(prev, sectionId, fieldId, targetIndex));
      setDirty(true);
    },
    [],
  );

  const handleRemoveField = useCallback((sectionId: string, fieldId: string) => {
    setSchema((prev) => removeField(prev, sectionId, fieldId));
    setSelectedFieldId((cur) => (cur === fieldId ? null : cur));
    setDirty(true);
  }, []);

  const handleAddSection = useCallback(() => {
    setSchema((prev) => addSection(prev, createSection()));
    setDirty(true);
  }, []);

  const handleUpdateSectionTitle = useCallback(
    (sectionId: string, title: string) => {
      setSchema((prev) => updateSection(prev, sectionId, { title }));
      setDirty(true);
    },
    [],
  );

  const handleChangeField = useCallback(
    (sectionId: string, fieldId: string, patch: Partial<FieldSchema>) => {
      setSchema((prev) => updateField(prev, sectionId, fieldId, patch));
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
          body: JSON.stringify({ schema }),
        }),
      "已保存",
    ).then((updated) => updated && setDirty(false));
  };

  const handleCheckin = () => {
    if (!id) return;
    void runAction(
      () => apiClient<FormTemplate>(`/templates/${id}/checkin`, { method: "POST" }),
      "已签入，锁定已释放",
    );
  };

  const handlePublish = () => {
    if (!id) return;
    void runAction(
      () => apiClient<FormTemplate>(`/templates/${id}/publish`, { method: "POST" }),
      "已发布",
    );
  };

  const handleForceUnlock = () => {
    if (!id) return;
    void runAction(
      () =>
        apiClient<FormTemplate>(`/templates/${id}/force-unlock`, { method: "POST" }),
      "已强制解锁",
    );
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

  const statusLabel =
    template.status === "published"
      ? "已发布"
      : template.status === "archived"
        ? "已归档"
        : "草稿";

  return (
    <div className="designer">
      <header className="designer-header">
        <div className="designer-title">
          <h1 className="designer-name">{template.name}</h1>
          {badge && <span className={`badge badge--${badge.tone}`}>{badge.label}</span>}
          <span className="badge badge--status">{statusLabel}</span>
          {dirty && <span className="designer-dirty">未保存</span>}
        </div>
        <div className="designer-actions">
          <button type="button" disabled={!isHolder || busy} onClick={handleSave}>
            保存
          </button>
          <button type="button" disabled={!isHolder || busy} onClick={handleCheckin}>
            签入
          </button>
          <button
            type="button"
            disabled={template.status !== "draft" || busy}
            onClick={handlePublish}
          >
            发布
          </button>
          {template.locked_by && !isHolder && (
            <button type="button" className="designer-unlock" disabled={busy} onClick={handleForceUnlock}>
              强制解锁
            </button>
          )}
        </div>
      </header>

      {notice && <p className="designer-notice">{notice}</p>}

      <div className="designer-body">
        <ComponentPalette onAddField={handleAddField} />
        <DesignCanvas
          schema={schema}
          selectedFieldId={selectedFieldId}
          onDropField={handleAddField}
          onSelectField={setSelectedFieldId}
          onMoveField={handleMoveField}
          onReorderField={handleReorderField}
          onRemoveField={handleRemoveField}
          onAddSection={handleAddSection}
          onUpdateSectionTitle={handleUpdateSectionTitle}
        />
        <PropertyPanel
          schema={schema}
          selected={selected}
          approvalChain={template.approval_chain as unknown as ApprovalChain | undefined}
          onChangeField={handleChangeField}
        />
      </div>
    </div>
  );
};
