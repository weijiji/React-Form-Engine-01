import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { ApiError } from "../../config/api";
import { Button, IconButton } from "../../components";
import { Form } from "../../form";
import type { ApprovalTargetOption, ApprovalDetailResponse } from "./types";
import {
  approveApproval,
  getApprovalDetail,
  listApprovalTargets,
  rejectApproval,
  returnApproval,
  transferApproval,
} from "./api";
import { statusLabel } from "../filler/labels";
import { resolveInstanceSchema } from "../filler/resolveSchema";
import { ApprovalChainSidebar } from "../filler/approvalSidebar";
import "../filler/filler.css";
import "./approver.css";

/**
 * 审批详情页 (work order 06) — the approver reviews a submission and acts on it.
 * Left: the full form rendered read-only from the frozen snapshot. Right: the
 * approval-chain timeline (reused ApprovalChainSidebar) plus the action area
 * (同意 / 拒绝 / 退回 / 转交). 拒绝/退回 require a comment (server rejects empty);
 * every action posts with a fresh Idempotency-Key (ADR-0002) and the detail's
 * `instanceVersion` optimistic lock (ADR-0003).
 *
 * A 409 surfaces as an explicit conflict hint (该提交已被撤回 / 该审批已被处理)
 * followed by an automatic refresh of the detail — if the record moved off this
 * approver (e.g. transferred), the page bounces back to the pending list.
 */

type DialogKind = "approve" | "reject" | "return" | "transfer";

const ACTION_CODES: Record<DialogKind, string> = {
  approve: "approval:approve",
  reject: "approval:reject",
  return: "approval:return",
  transfer: "approval:transfer",
};

type ActionPayload = { comment?: string; targetUserId?: string };

/** The four action APIs, keyed by kind — replaces a repeated if-cascade. */
const ACTION_CALLS: Record<
  DialogKind,
  (
    id: string,
    version: number,
    payload: ActionPayload,
  ) => Promise<ApprovalDetailResponse>
> = {
  approve: (id, version) => approveApproval(id, version),
  reject: (id, version, payload) => rejectApproval(id, version, payload.comment!),
  return: (id, version, payload) => returnApproval(id, version, payload.comment!),
  transfer: (id, version, payload) =>
    transferApproval(id, version, payload.targetUserId!),
};

export const ApprovalPage: React.FC = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [detail, setDetail] = useState<ApprovalDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [targets, setTargets] = useState<ApprovalTargetOption[] | null>(null);
  const [targetsError, setTargetsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getApprovalDetail(id)
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const parsedSchema = useMemo(
    () => (detail ? resolveInstanceSchema(detail.instance) : null),
    [detail],
  );

  const record = detail?.approval;
  // The record is actionable only while pending — after a handled record the
  // server rejects any action with 409 APPROVAL_NOT_PENDING.
  const isActionable = !!record && record.action === "pending";

  /**
   * Re-fetch after a 409 (work order 06 optimistic-lock UI): the detail reloads
   * so the page reflects the current state, but the conflict hint stays visible
   * so the user knows why their action didn't land. If the record left this
   * approver (e.g. transferred), the reload 403s and we go back to the list.
   */
  const refreshAfterConflict = useCallback(async () => {
    try {
      const fresh = await getApprovalDetail(id);
      setDetail(fresh);
    } catch {
      navigate("/approver/pending", { replace: true });
    }
  }, [id, navigate]);

  async function runAction(kind: DialogKind, payload: ActionPayload = {}): Promise<void> {
    if (!detail) return;
    setBusy(true);
    setError(null);
    setConflict(null);
    try {
      const updated = await ACTION_CALLS[kind](record!.id, detail.instance.version, payload);
      setDetail(updated);
      setDialog(null);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.statusCode === 409) {
        setConflict(err.message);
        setDialog(null);
        void refreshAfterConflict();
      } else {
        setError(err instanceof Error ? err.message : "操作失败，请稍后重试");
      }
    } finally {
      setBusy(false);
    }
  }

  async function openTransferDialog() {
    setDialog("transfer");
    if (targets === null && targetsError === null) {
      try {
        const res = await listApprovalTargets();
        setTargets(res.users);
      } catch (err: unknown) {
        setTargetsError(err instanceof Error ? err.message : "加载审批人失败");
      }
    }
  }

  if (error && !detail) {
    return (
      <div className="filler">
        <p className="filler-error">{error}</p>
        <Link to="/approver/pending">返回待审批列表</Link>
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

  const instance = detail.instance;
  const availableActions = (
    ["approve", "reject", "return", "transfer"] as DialogKind[]
  ).filter((k) => user?.permissions.includes(ACTION_CODES[k]));

  return (
    <div className="fill">
      <div className="fill-top">
        <div className="fill-top-left">
          <Link className="fill-back" to="/approver/pending">
            ← 待审批
          </Link>
          <h2 className="fill-title">{instance.template.name}</h2>
          <span className={`fill-status fill-status--${instance.status}`}>
            {statusLabel(instance.status)}
          </span>
        </div>
      </div>

      {conflict && (
        <p className="approver-conflict" role="alert">
          {conflict}（页面已刷新）
        </p>
      )}
      {error && <p className="filler-error">{error}</p>}

      <div className="fill-body">
        <div className="fill-form">
          <Form
            schema={parsedSchema}
            initialValues={instance.field_values}
            readOnly
          />
        </div>

        <aside className="fill-side">
          <ApprovalChainSidebar detail={instance} />

          <div className="approver-actions">
            <div className="approver-actions-title">审批操作</div>
            {!isActionable ? (
              <p className="approver-done">
                该节点已处理，无需进一步操作
              </p>
            ) : (
              <>
                <div className="approver-action-btns">
                  {availableActions.includes("approve") && (
                    <Button
                      variant="primary"
                      disabled={busy}
                      onClick={() => setDialog("approve")}
                    >
                      同意
                    </Button>
                  )}
                  {availableActions.includes("reject") && (
                    <Button
                      variant="danger"
                      disabled={busy}
                      onClick={() => setDialog("reject")}
                    >
                      拒绝
                    </Button>
                  )}
                  {availableActions.includes("return") && (
                    <Button disabled={busy} onClick={() => setDialog("return")}>
                      退回
                    </Button>
                  )}
                  {availableActions.includes("transfer") && (
                    <Button disabled={busy} onClick={() => void openTransferDialog()}>
                      转交
                    </Button>
                  )}
                </div>
                <p className="approver-hint">
                  拒绝或退回时需填写审批意见；转交后由新审批人继续处理。
                </p>
              </>
            )}
          </div>
        </aside>
      </div>

      {dialog && (
        <ActionDialog
          kind={dialog}
          targets={targets}
          targetsError={targetsError}
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={(payload) => void runAction(dialog, payload)}
        />
      )}
    </div>
  );
};

/** Modal for one approval action — confirm, comment (reject/return), target (transfer). */
function ActionDialog({
  kind,
  targets,
  targetsError,
  busy,
  onCancel,
  onConfirm,
}: {
  kind: DialogKind;
  targets: ApprovalTargetOption[] | null;
  targetsError: string | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (payload: ActionPayload) => void;
}) {
  const [comment, setComment] = useState("");
  const [targetUserId, setTargetUserId] = useState("");

  const TITLE: Record<DialogKind, string> = {
    approve: "确认同意",
    reject: "确认拒绝",
    return: "确认退回",
    transfer: "转交审批",
  };
  const CONFIRM_LABEL: Record<DialogKind, string> = {
    approve: "同意",
    reject: "拒绝",
    return: "退回",
    transfer: "转交",
  };
  const CONFIRM_VARIANT: Record<DialogKind, "primary" | "danger" | "default"> = {
    approve: "primary",
    reject: "danger",
    return: "default",
    transfer: "default",
  };
  const requiresComment = kind === "reject" || kind === "return";
  const confirmDisabled =
    busy ||
    (requiresComment && comment.trim() === "") ||
    (kind === "transfer" && targetUserId === "");

  return (
    <div
      className="filler-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={TITLE[kind]}
      onClick={onCancel}
    >
      <div className="approver-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="approver-dialog-head">
          <h3>{TITLE[kind]}</h3>
          <IconButton size="sm" label="关闭" onClick={onCancel}>
            ×
          </IconButton>
        </div>

        <div className="approver-dialog-body">
          {kind === "approve" && (
            <p className="approver-done">确定同意该审批吗？同意后将流转到下一节点或完成流程。</p>
          )}

          {requiresComment && (
            <label className="approver-hint">
              审批意见（必填）
              <textarea
                className="approver-textarea"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={kind === "reject" ? "请填写拒绝原因" : "请填写退回原因"}
              />
            </label>
          )}

          {kind === "transfer" &&
            (targetsError ? (
              <p className="approver-error">{targetsError}</p>
            ) : targets === null ? (
              <p className="approver-done">加载审批人…</p>
            ) : targets.length === 0 ? (
              <p className="approver-done">没有可转交的审批人</p>
            ) : (
              <>
                <label className="approver-hint">
                  转交给
                  <select
                    className="approver-select"
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                  >
                    <option value="">请选择审批人</option>
                    {targets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="approver-hint">
                  转交说明（选填）
                  <textarea
                    className="approver-textarea"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </label>
              </>
            ))}
        </div>

        <div className="approver-dialog-actions">
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            取消
          </Button>
          <Button
            variant={CONFIRM_VARIANT[kind]}
            disabled={confirmDisabled}
            onClick={() => onConfirm({ comment: comment.trim() || undefined, targetUserId })}
          >
            {busy ? "处理中…" : CONFIRM_LABEL[kind]}
          </Button>
        </div>
      </div>
    </div>
  );
}
