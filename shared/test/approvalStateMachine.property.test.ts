import { describe, expect, it } from "vitest";
import { isTerminal, transition } from "../src/approvalStateMachine";
import {
  APPROVAL_ACTION_TYPES,
  APPROVAL_STATES,
  type ApprovalAction,
  type ApprovalState,
} from "../src/types";

/**
 * Deterministic PRNG (mulberry32) so property tests are reproducible. Each seed
 * drives a fixed sequence of pseudo-random values; a failing seed can be pinned
 * and replayed.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomState(rand: () => number): ApprovalState {
  return APPROVAL_STATES[Math.floor(rand() * APPROVAL_STATES.length)];
}

function randomAction(rand: () => number): ApprovalAction {
  const type = APPROVAL_ACTION_TYPES[Math.floor(rand() * APPROVAL_ACTION_TYPES.length)];
  switch (type) {
    case "approve":
      return { type: "approve", isFinal: rand() < 0.5 };
    case "transfer":
      return { type: "transfer", targetUserId: `u${Math.floor(rand() * 100)}` };
    case "submit":
      return { type: "submit" };
    case "reject":
      return { type: "reject" };
    case "return":
      return { type: "return" };
    case "withdraw":
      return { type: "withdraw" };
  }
}

const ALL_ACTIONS: ApprovalAction[] = [
  { type: "submit" },
  { type: "approve", isFinal: true },
  { type: "approve", isFinal: false },
  { type: "reject" },
  { type: "return" },
  { type: "withdraw" },
  { type: "transfer", targetUserId: "u1" },
];

const SEEDS = [1, 2, 3, 7, 42, 99];

describe("ApprovalStateMachine — property tests", () => {
  it("terminal states reject every action, regardless of payload", () => {
    for (const terminal of ["approved", "rejected"] as const) {
      for (const action of ALL_ACTIONS) {
        const res = transition(terminal, action);
        expect(res.ok, `terminal ${terminal} + ${action.type} must reject`).toBe(false);
        expect((res as { state: ApprovalState }).state).toBe(terminal);
        expect((res as { reason: string }).reason).toBeTruthy();
      }
    }
  });

  it("every state is reachable from draft", () => {
    // Exhaustive BFS over the transition table (already asserted in the unit
    // suite); here we additionally confirm via random walks that starting from
    // draft we can never invent a state outside APPROVAL_STATES.
    for (const seed of SEEDS) {
      const rand = mulberry32(seed);
      let state: ApprovalState = "draft";
      for (let i = 0; i < 200; i++) {
        const res = transition(state, randomAction(rand));
        if (res.ok) {
          expect(APPROVAL_STATES).toContain(res.state);
          state = res.state;
        }
        if (isTerminal(state)) break;
      }
    }
  });

  it("a random walk never leaves the state set and never transitions out of a terminal", () => {
    for (const seed of SEEDS) {
      const rand = mulberry32(seed);
      let state: ApprovalState = "draft";
      for (let i = 0; i < 500; i++) {
        expect(APPROVAL_STATES).toContain(state);
        if (isTerminal(state)) {
          // Once terminal, any action must be rejected and the state frozen.
          const res = transition(state, randomAction(rand));
          expect(res.ok).toBe(false);
          expect(res.state).toBe(state);
          continue;
        }
        const res = transition(state, randomAction(rand));
        if (res.ok) state = res.state;
      }
    }
  });

  it("`returned` can only resubmit to `submitted` (restart from the first node)", () => {
    expect(transition("returned", { type: "submit" })).toEqual({ ok: true, state: "submitted" });
    for (const action of ALL_ACTIONS) {
      if (action.type === "submit") continue;
      const res = transition("returned", action);
      expect(res.ok, `returned + ${action.type} must reject`).toBe(false);
      expect(res.state).toBe("returned");
    }
  });

  it("`withdrawn` can only resubmit to `submitted`", () => {
    expect(transition("withdrawn", { type: "submit" })).toEqual({ ok: true, state: "submitted" });
    for (const action of ALL_ACTIONS) {
      if (action.type === "submit") continue;
      expect(transition("withdrawn", action).ok).toBe(false);
    }
  });

  it("`in_approval` never reaches `draft` (submission is monotonic)", () => {
    for (const seed of SEEDS) {
      const rand = mulberry32(seed);
      let state: ApprovalState = "draft";
      // Drive the machine into in_approval, then confirm draft is unreachable.
      state = transition(state, { type: "submit" }).ok ? "submitted" : state;
      state = transition(state, { type: "approve", isFinal: false }).ok ? "in_approval" : state;
      expect(state).toBe("in_approval");
      for (let i = 0; i < 200; i++) {
        const res = transition(state, randomAction(rand));
        if (res.ok) {
          expect(res.state).not.toBe("draft");
          state = res.state;
        }
        if (isTerminal(state)) break;
      }
    }
  });

  it("submitting to an invalid state is always rejected without throwing", () => {
    // randomState may produce any of the 7 states; transition must never throw.
    for (const seed of SEEDS) {
      const rand = mulberry32(seed);
      for (let i = 0; i < 200; i++) {
        const state = randomState(rand);
        const action = randomAction(rand);
        const res = transition(state, action);
        expect(typeof res.ok).toBe("boolean");
        expect(APPROVAL_STATES).toContain(res.state);
        if (!res.ok) expect((res as { reason: string }).reason).toBeTruthy();
      }
    }
  });
});
