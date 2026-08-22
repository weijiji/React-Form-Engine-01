import { describe, expect, it } from "vitest";
import {
  canTransition,
  getAllowedActions,
  isTerminal,
  TERMINAL_STATES,
  transition,
} from "../src/approvalStateMachine";
import { APPROVAL_STATES, type ApprovalState } from "../src/types";

describe("ApprovalStateMachine", () => {
  it("exposes 7 states and 2 terminal states", () => {
    expect(APPROVAL_STATES).toHaveLength(7);
    expect(TERMINAL_STATES).toEqual(["approved", "rejected"]);
  });

  describe("legal transitions", () => {
    it("draft → submit → submitted", () => {
      expect(transition("draft", { type: "submit" })).toEqual({ ok: true, state: "submitted" });
    });

    it("submitted → approve (final) → approved", () => {
      expect(transition("submitted", { type: "approve", isFinal: true })).toEqual({ ok: true, state: "approved" });
    });

    it("submitted → approve (!final) → in_approval", () => {
      expect(transition("submitted", { type: "approve", isFinal: false })).toEqual({ ok: true, state: "in_approval" });
    });

    it("submitted → reject → rejected", () => {
      expect(transition("submitted", { type: "reject" })).toEqual({ ok: true, state: "rejected" });
    });

    it("submitted → withdraw → withdrawn", () => {
      expect(transition("submitted", { type: "withdraw" })).toEqual({ ok: true, state: "withdrawn" });
    });

    // Work order 06: the node-1 approver can return/transfer too — the UI renders
    // 退回/转交 for every pending node, so `submitted` must allow them.
    it("submitted → return → returned (node-1 approver can return)", () => {
      expect(transition("submitted", { type: "return" })).toEqual({ ok: true, state: "returned" });
    });

    it("submitted → transfer stays submitted (node-1 approver can transfer)", () => {
      expect(transition("submitted", { type: "transfer", targetUserId: "u2" })).toEqual({
        ok: true,
        state: "submitted",
      });
    });

    it("in_approval → approve (final) → approved", () => {
      expect(transition("in_approval", { type: "approve", isFinal: true })).toEqual({ ok: true, state: "approved" });
    });

    it("in_approval → approve (!final) stays in_approval", () => {
      expect(transition("in_approval", { type: "approve", isFinal: false })).toEqual({ ok: true, state: "in_approval" });
    });

    it("in_approval → return → returned", () => {
      expect(transition("in_approval", { type: "return" })).toEqual({ ok: true, state: "returned" });
    });

    it("in_approval → transfer stays in_approval", () => {
      expect(transition("in_approval", { type: "transfer", targetUserId: "u2" })).toEqual({ ok: true, state: "in_approval" });
    });

    it("returned → submit → submitted (restarts from the first node)", () => {
      expect(transition("returned", { type: "submit" })).toEqual({ ok: true, state: "submitted" });
    });

    it("withdrawn → submit → submitted (resubmit)", () => {
      expect(transition("withdrawn", { type: "submit" })).toEqual({ ok: true, state: "submitted" });
    });
  });

  describe("illegal transitions", () => {
    it("rejects terminal-state transitions and returns a reason", () => {
      for (const terminal of TERMINAL_STATES) {
        const res = transition(terminal, { type: "approve", isFinal: false });
        expect(res.ok).toBe(false);
        expect((res as { reason: string }).reason).toContain(terminal);
      }
    });

    it("rejects approve/reject/return/transfer/withdraw from draft", () => {
      const actions: Parameters<typeof transition>[1][] = [
        { type: "approve", isFinal: false },
        { type: "reject" },
        { type: "return" },
        { type: "transfer" },
        { type: "withdraw" },
      ];
      for (const action of actions) {
        expect(transition("draft", action).ok).toBe(false);
      }
    });

    it("rejects submit from in_approval", () => {
      expect(transition("in_approval", { type: "submit" }).ok).toBe(false);
    });

    it("rejects submit from submitted", () => {
      expect(transition("submitted", { type: "submit" }).ok).toBe(false);
    });

    it("leaves the state unchanged on rejection", () => {
      const res = transition("in_approval", { type: "submit" });
      expect(res).toEqual({ ok: false, state: "in_approval", reason: expect.any(String) });
    });
  });

  it("getAllowedActions returns the legal action types per state", () => {
    expect(getAllowedActions("draft")).toEqual(["submit"]);
    expect(getAllowedActions("submitted").sort()).toEqual(["approve", "reject", "return", "transfer", "withdraw"].sort());
    expect(getAllowedActions("in_approval").sort()).toEqual(["approve", "reject", "return", "transfer", "withdraw"].sort());
    expect(getAllowedActions("returned")).toEqual(["submit"]);
    expect(getAllowedActions("withdrawn")).toEqual(["submit"]);
    expect(getAllowedActions("approved")).toEqual([]);
    expect(getAllowedActions("rejected")).toEqual([]);
  });

  it("isTerminal / canTransition helpers", () => {
    expect(isTerminal("approved")).toBe(true);
    expect(isTerminal("rejected")).toBe(true);
    expect(isTerminal("draft")).toBe(false);
    expect(canTransition("draft", { type: "submit" })).toBe(true);
    expect(canTransition("draft", { type: "reject" })).toBe(false);
  });

  it("every non-terminal state is reachable from draft", () => {
    const reachable = reachableStates();
    for (const state of APPROVAL_STATES) {
      expect(reachable.has(state as ApprovalState), `state ${state} should be reachable`).toBe(true);
    }
  });
});

function reachableStates(): Set<ApprovalState> {
  const seen = new Set<ApprovalState>(["draft"]);
  const queue: ApprovalState[] = ["draft"];
  while (queue.length > 0) {
    const state = queue.shift()!;
    for (const actionType of getAllowedActions(state)) {
      const results =
        actionType === "approve"
          ? [transition(state, { type: "approve", isFinal: true }), transition(state, { type: "approve", isFinal: false })]
          : [transition(state, { type: actionType })];
      for (const res of results) {
        if (res.ok && !seen.has(res.state)) {
          seen.add(res.state);
          queue.push(res.state);
        }
      }
    }
  }
  return seen;
}
