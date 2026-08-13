import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { parseSchema, type ApprovalChain, type FormValues } from "form-engine-core";
import { apiClient, ApiError } from "../../config/api";
import { Form } from "../../form";
import type { ApprovalRecordSummary, InstanceDetail } from "./types";
import { ACTION_LABEL, formatDate, statusLabel } from "./labels";
import { useAutosave } from "./useAutosave";
import "./filler.css";

/**
 * 填单页 (work order 05) — renders a FormInstance with the engine `Form`,
 * autosaves values to `PUT /instances/:id/values`, and submits atomically via
 * `POST /instances/:id/submit`. A right-hand sidebar shows the approval chain;
 * for a submitted instance the form is read-only (frozen snapshot).
 */
export const FormFillPage: React.FC = () => {
  const { id = "" } = useParams();
  const [detail, setDetail] = useState<InstanceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState(false);
  const latestValuesRef = useRef<FormValues>({});

  useEffect(() => {
    let cancelled = false;
    setError(null);
    apiClient<InstanceDetail>(`/instances/${id}`)
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const isDraft = detail?.status === "draft";

  // Drafts edit the live template; submitted instances render the frozen
  // snapshot so later template edits can't change what was approved.
  const rawSchema = useMemo(() => {
    if (!detail) return null;
    if (isDraft) return detail.template.schema;
    const snapshot = detail.template_snapshot as
      | { schema?: unknown; approval_chain?: unknown }
      | undefined;
    return snapshot?.schema ?? detail.template.schema;
  }, [detail, isDraft]);

  const parsedSchema = useMemo(() => {
    if (!rawSchema) return null;
    const chain = (detail?.template.approval_chain ?? null) as
      | ApprovalChain
      | Record<string, never>
      | null;
    try {
      return parseSchema(rawSchema, chain ?? null);
    } catch {
      return null;
    }
  }, [rawSchema, detail?.template.approval_chain]);

  const saveValues = useMemo(
    () =>
      async (values: FormValues): Promise<void> => {
        await apiClient(`/instances/${id}/values`, {
          method: "PUT",
          body: JSON.stringify({ field_values: values }),
        });
      },
    [id],
  );
  const autosave = useAutosave(saveValues, detail?.field_values ?? {});

  const onValues = useCallback(
    (values: FormValues): void => {
      latestValuesRef.current = values;
      autosave.onValues(values);
    },
    [autosave],
  );

  const saveDraft = async (): Promise<void> => {
    setDraftNotice(false);
    try {
      await apiClient("/drafts", {
        method: "POST",
        body: JSON.stringify({
          template_id: detail?.template_id,
          field_values: latestValuesRef.current,
        }),
      });
      setDraftNotice(true);
    } catch (err: unknown) {
      setSubmitError(
        err instanceof ApiError ? err.message : "保存草稿失败，请稍后重试",
      );
    }
  };

  const handleSubmit = async (values: FormValues): Promise<void> => {
    setSubmitError(null);
    try {
      // Settle any pending debounced autosave first so a queued PUT doesn't fire
      // after submit flips the status away from `draft`.
      await autosave.flush();
      const updated = await apiClient<InstanceDetail>(
        `/instances/${id}/submit`,
        {
          method: "POST",
          body: JSON.stringify({ field_values: values }),
        },
      );
      setDetail(updated);
    } catch (err: unknown) {
      setSubmitError(
        err instanceof ApiError ? err.message : "提交失败，请稍后重试",
      );
    }
  };

  if (error) {
    return (
      <div className="filler">
        <p className="filler-error">{error}</p>
        <Link to="/filler/forms">返回表单中心</Link>
      </div>
    );
  }

  if (!detail || !parsedSchema) {
    return (
      <div className="filler">
        <p className="filler-empty">加载中…</p>
      </div>
    );
  }

  return (
    <div className="fill">
      <div className="fill-top">
        <div className="fill-top-left">
          <Link className="fill-back" to="/filler/forms">
            ← 返回
          </Link>
          <h2 className="fill-title">{detail.template.name}</h2>
          <span className={`fill-status fill-status--${detail.status}`}>
            {statusLabel(detail.status)}
          </span>
        </div>
        <div className="fill-top-right">
          {isDraft && (
            <>
              <span className="fill-save-indicator" aria-live="polite">
                {autosave.label}
              </span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void saveDraft()}
              >
                保存草稿
              </button>
            </>
          )}
        </div>
      </div>

      {draftNotice && <p className="fill-draft-notice">已保存到「我的草稿」</p>}
      {submitError && <p className="fill-submit-error">{submitError}</p>}

      <div className="fill-body">
        <div className="fill-form">
          <Form
            schema={parsedSchema}
            initialValues={detail.field_values}
            readOnly={!isDraft}
            onSubmit={handleSubmit}
            onChange={onValues}
            submitLabel="提交"
          />
        </div>

        <aside className="fill-side">
          <ApprovalChainSidebar detail={detail} />
        </aside>
      </div>
    </div>
  );
};

function ApprovalChainSidebar({ detail }: { detail: InstanceDetail }) {
  const chain = detail.template.approval_chain as
    | { nodes?: Array<{ id: string; order: number; label?: string }> }
    | null
    | undefined;
  const nodes = chain?.nodes ?? [];
  const recordByNode = new Map<string, ApprovalRecordSummary>(
    (detail.approval_records ?? []).map((r) => [r.node_id, r]),
  );

  return (
    <div className="chain-side">
      <h3 className="chain-side-title">审批流程</h3>
      {nodes.length === 0 ? (
        <p className="chain-side-empty">该表单无需审批</p>
      ) : (
        <ol className="chain-side-list">
          {nodes.map((node) => {
            const record = recordByNode.get(node.id);
            return (
              <li key={node.id} className="chain-side-node">
                <span className="chain-side-dot" aria-hidden="true">
                  {node.order}
                </span>
                <div className="chain-side-card">
                  <div className="chain-side-label">
                    {node.label ?? `第 ${node.order} 级审批`}
                  </div>
                  <div className="chain-side-approver">
                    {record?.approver_name ?? (record ? "—" : "提交后解析")}
                  </div>
                  {record && (
                    <div className="chain-side-action">
                      <span
                        className={`chain-side-badge chain-side-badge--${record.action}`}
                      >
                        {ACTION_LABEL[record.action] ?? record.action}
                      </span>
                      {record.acted_at && (
                        <span className="chain-side-time">
                          {formatDate(record.acted_at)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
