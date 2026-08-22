import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { FormValues } from "form-engine-core";
import { apiClient, ApiError } from "../../config/api";
import { Button } from "../../components";
import { Form } from "../../form";
import type { InstanceDetail } from "./types";
import { statusLabel } from "./labels";
import { useAutosave } from "./useAutosave";
import { resolveInstanceSchema } from "./resolveSchema";
import { ApprovalChainSidebar } from "./approvalSidebar";
import "./filler.css";

/**
 * 填单页 (work order 05) — renders a FormInstance with the engine `Form`,
 * autosaves values to `PUT /instances/:id/values`, and submits atomically via
 * `POST /instances/:id/submit`. A right-hand sidebar shows the approval chain;
 * for a submitted instance the form is read-only (frozen snapshot).
 *
 * Drafts (ADR-0014: an instance IS the draft) edit the live template and run a
 * best-effort fieldId migration on load (ADR-0004): removed fields' values are
 * kept in `_orphaned`, shown as a collapsible banner, and written back with each
 * autosave so nothing is lost if the user later re-submits.
 */
export const FormFillPage: React.FC = () => {
  const { id = "" } = useParams();
  const [detail, setDetail] = useState<InstanceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [orphansOpen, setOrphansOpen] = useState(false);
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

  // Drafts and returned instances are editable: a draft is in-progress work and
  // a returned one waits on the submitter to fix + resubmit (work order 06).
  const isDraft = detail?.status === "draft";
  const isReturned = detail?.status === "returned";
  const editable = isDraft || isReturned;

  // Drafts edit the live template; submitted instances render the frozen
  // snapshot so later template edits can't change what was approved.
  const parsedSchema = useMemo(
    () => (detail ? resolveInstanceSchema(detail) : null),
    [detail],
  );

  // Autosave must carry `_orphaned` back (ADR-0004): the GET stripped it out of
  // field_values, so without this merge a later autosave would drop the values
  // the migration preserved.
  const saveValues = useMemo(
    () =>
      async (values: FormValues): Promise<void> => {
        const orphan = detail?._orphaned;
        // Echo `_orphaned` back so autosave preserves it (ADR-0004), but only
        // when there actually is orphan data — a clean draft must not store an
        // empty `_orphaned: {}`.
        const body: FormValues =
          orphan && Object.keys(orphan).length > 0
            ? { ...values, _orphaned: orphan }
            : values;
        await apiClient(`/instances/${id}/values`, {
          method: "PUT",
          body: JSON.stringify({ field_values: body }),
        });
      },
    [id, detail?._orphaned],
  );
  const autosave = useAutosave(saveValues, detail?.field_values ?? {});

  const onValues = useCallback(
    (values: FormValues): void => {
      latestValuesRef.current = values;
      autosave.onValues(values);
    },
    [autosave],
  );

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
          {editable && (
            <span className="fill-save-indicator" aria-live="polite">
              {autosave.label}
            </span>
          )}
        </div>
      </div>

      {isDraft && detail.version_mismatch && (
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
              {JSON.stringify(detail._orphaned ?? {}, null, 2)}
            </pre>
          )}
        </div>
      )}
      {submitError && <p className="fill-submit-error">{submitError}</p>}

      <div className="fill-body">
        <div className="fill-form">
          <Form
            schema={parsedSchema}
            initialValues={detail.field_values}
            readOnly={!editable}
            onSubmit={handleSubmit}
            onChange={onValues}
            submitLabel={isReturned ? "重新提交" : "提交"}
          />
        </div>

        <aside className="fill-side">
          <ApprovalChainSidebar detail={detail} />
        </aside>
      </div>
    </div>
  );
};

