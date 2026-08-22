/**
 * ApprovalStateMachine — 7 states × 6 actions.
 *
 * States: draft → submitted → in_approval → approved | rejected | returned | withdrawn
 * Actions: submit, approve, reject, return, withdraw, transfer
 *
 * Transition table (see docs/design-spec §6.3):
 *
 *   draft        --submit---------> submitted
 *   submitted    --approve(last)---> approved
 *   submitted    --approve(!last)--> in_approval
 *   submitted    --reject----------> rejected
 *   submitted    --return----------> returned
 *   submitted    --transfer--------> submitted   (state unchanged, approver changes)
 *   submitted    --withdraw--------> withdrawn
 *   in_approval  --approve(last)---> approved
 *   in_approval  --approve(!last)--> in_approval
 *   in_approval  --reject----------> rejected
 *   in_approval  --return----------> returned
 *   in_approval  --transfer--------> in_approval   (state unchanged, approver changes)
 *   in_approval  --withdraw--------> withdrawn
 *   returned     --submit----------> submitted     (restarts from the first node)
 *   withdrawn    --submit----------> submitted     (resubmit after withdrawal)
 *
 * Terminal states: approved, rejected — no outgoing transitions.
 *
 * Role enforcement (who may perform each action) is layered ABOVE this machine;
 * the machine is role-agnostic. `getAllowedActions` exists so an authorization
 * layer can intersect the caller's role with the legal actions for a state.
 *
 * Note: `transfer` does not change state — the transition keeps the current
 * state (`submitted` / `in_approval`) and the caller swaps the approver
 * separately. `return`/`transfer` are legal from the first node (`submitted`)
 * just as from any later node (`in_approval`): every pending approver can hand
 * the submission back or pass it on.
 */

import type {
  ApprovalAction,
  ApprovalActionType,
  ApprovalState,
} from "./types";

export const TERMINAL_STATES: readonly ApprovalState[] = ["approved", "rejected"];

interface Transition {
  from: ApprovalState;
  action: ApprovalActionType;
  /** For `approve` only: whether this is the final approval node. */
  isFinal?: boolean;
  to: ApprovalState;
}

const TRANSITIONS: Transition[] = [
  { from: "draft", action: "submit", to: "submitted" },

  { from: "submitted", action: "approve", isFinal: false, to: "in_approval" },
  { from: "submitted", action: "approve", isFinal: true, to: "approved" },
  { from: "submitted", action: "reject", to: "rejected" },
  { from: "submitted", action: "return", to: "returned" },
  { from: "submitted", action: "transfer", to: "submitted" },
  { from: "submitted", action: "withdraw", to: "withdrawn" },

  { from: "in_approval", action: "approve", isFinal: false, to: "in_approval" },
  { from: "in_approval", action: "approve", isFinal: true, to: "approved" },
  { from: "in_approval", action: "reject", to: "rejected" },
  { from: "in_approval", action: "return", to: "returned" },
  { from: "in_approval", action: "transfer", to: "in_approval" },
  { from: "in_approval", action: "withdraw", to: "withdrawn" },

  { from: "returned", action: "submit", to: "submitted" },
  { from: "withdrawn", action: "submit", to: "submitted" },
];

export type TransitionResult =
  | { ok: true; state: ApprovalState }
  | { ok: false; state: ApprovalState; reason: string };

/** Transition to the next state. Illegal transitions are rejected with a reason. */
export function transition(current: ApprovalState, action: ApprovalAction): TransitionResult {
  const edge = TRANSITIONS.find(
    (t) =>
      t.from === current &&
      t.action === action.type &&
      (action.type === "approve" ? t.isFinal === action.isFinal : true),
  );

  if (!edge) {
    return {
      ok: false,
      state: current,
      reason: `状态 "${current}" 不允许执行动作 "${action.type}"`,
    };
  }
  return { ok: true, state: edge.to };
}

/** The set of action types that are legal from a given state. */
export function getAllowedActions(state: ApprovalState): ApprovalActionType[] {
  const actions = new Set<ApprovalActionType>();
  for (const t of TRANSITIONS) {
    if (t.from === state) actions.add(t.action);
  }
  return [...actions];
}

export function isTerminal(state: ApprovalState): boolean {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}

export function canTransition(state: ApprovalState, action: ApprovalAction): boolean {
  return transition(state, action).ok;
}
