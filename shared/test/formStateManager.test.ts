import { describe, expect, it } from "vitest";
import { createFormReducer, createInitialState, FormStateManager } from "../src/formStateManager";
import { parseSchema } from "../src/schemaParser";
import type { FormState } from "../src/types";

function schema() {
  return parseSchema({
    schemaVersion: "1.0.0",
    sections: [
      {
        id: "sec",
        title: "x",
        fields: [
          { id: "type", type: "select", label: "类型", required: true },
          {
            id: "detail",
            type: "text",
            label: "详情",
            required: false,
            visibilityCondition: { fieldId: "type", operator: "equals", value: "rd" },
          },
          { id: "start", type: "date", label: "开始", required: false },
          {
            id: "end",
            type: "date",
            label: "结束",
            required: false,
            validation: { rules: [{ type: "crossField", fieldId: "start", operator: "greaterThan", message: "结束需晚于开始" }] },
          },
        ],
      },
    ],
  });
}

describe("FormStateManager (reducer)", () => {
  it("creates initial state with visibility computed from initial values", () => {
    const state = createInitialState(schema(), { type: "rd" });
    expect(state.visibility.detail).toBe(true);
    expect(state.dirty).toBe(false);
    expect(state.submitting).toBe(false);
  });

  it("SET_VALUE updates values, dirty, visibility and errors", () => {
    const reduce = createFormReducer(schema());
    const s0 = createInitialState(schema(), { type: "office" });
    expect(s0.visibility.detail).toBe(false);

    const s1 = reduce(s0, { type: "SET_VALUE", fieldId: "type", value: "rd" });
    expect(s1.values.type).toBe("rd");
    expect(s1.visibility.detail).toBe(true);
    expect(s1.dirty).toBe(true);
  });

  it("SET_VALUE with the same value is a no-op", () => {
    const reduce = createFormReducer(schema());
    const s0 = createInitialState(schema(), { type: "rd" });
    expect(reduce(s0, { type: "SET_VALUE", fieldId: "type", value: "rd" })).toBe(s0);
  });

  it("recomputes cross-field errors when the referenced field changes", () => {
    const reduce = createFormReducer(schema());
    let s = createInitialState(schema(), { start: "2026-01-01", end: "2026-01-02" });
    expect(s.errors.end).toBeUndefined();

    s = reduce(s, { type: "SET_VALUE", fieldId: "end", value: "2025-01-01" });
    expect(s.errors.end).toEqual([expect.objectContaining({ rule: "crossField" })]);

    s = reduce(s, { type: "SET_VALUE", fieldId: "end", value: "2026-02-01" });
    expect(s.errors.end).toBeUndefined();
  });

  it("clears errors for a field that becomes hidden", () => {
    const reduce = createFormReducer(schema());
    let s = createInitialState(schema(), { type: "rd" });
    s = reduce(s, { type: "BLUR", fieldId: "detail" });
    // detail is optional, no error; instead force one via a required+hidden path below
    expect(s.touched.detail).toBe(true);

    // Build a schema where a required field is conditionally hidden.
    const reduce2 = createFormReducer(
      parseSchema({
        schemaVersion: "1.0.0",
        sections: [
          {
            id: "sec",
            title: "x",
            fields: [
              { id: "toggle", type: "select", label: "t", required: false },
              { id: "hiddenReq", type: "text", label: "h", required: true, visibilityCondition: { fieldId: "toggle", operator: "equals", value: "on" } },
            ],
          },
        ],
      }),
    );
    let s2 = createInitialState(
      parseSchema({
        schemaVersion: "1.0.0",
        sections: [
          {
            id: "sec",
            title: "x",
            fields: [
              { id: "toggle", type: "select", label: "t", required: false },
              { id: "hiddenReq", type: "text", label: "h", required: true, visibilityCondition: { fieldId: "toggle", operator: "equals", value: "on" } },
            ],
          },
        ],
      }),
      { toggle: "on" },
    );
    s2 = reduce2(s2, { type: "VALIDATE_ALL" });
    expect(s2.errors.hiddenReq).toBeDefined();

    s2 = reduce2(s2, { type: "SET_VALUE", fieldId: "toggle", value: "off" });
    expect(s2.errors.hiddenReq).toBeUndefined();
  });

  it("marks touched only on BLUR, not on SET_VALUE", () => {
    const reduce = createFormReducer(schema());
    let s = createInitialState(schema());
    s = reduce(s, { type: "SET_VALUE", fieldId: "type", value: "rd" });
    expect(s.touched.type).toBeUndefined();

    s = reduce(s, { type: "BLUR", fieldId: "type" });
    expect(s.touched.type).toBe(true);
  });

  it("RESET returns a fresh initial state", () => {
    const reduce = createFormReducer(schema(), { type: "rd" });
    const s0 = createInitialState(schema(), { type: "rd" });
    const s1 = reduce(s0, { type: "SET_VALUE", fieldId: "type", value: "office" });
    expect(s1.dirty).toBe(true);

    const s2 = reduce(s1, { type: "RESET" });
    expect(s2).not.toBe(s0);
    expect(s2.dirty).toBe(false);
    expect(s2.values.type).toBe("rd");
  });

  it("RESTORE restores a snapshot", () => {
    const reduce = createFormReducer(schema());
    const snapshot: FormState = {
      values: { type: "office" },
      errors: {},
      visibility: { type: true, detail: false, start: true, end: true, sec: true },
      disabled: {},
      touched: { type: true },
      dirty: true,
      submitting: false,
    };
    const s = reduce(createInitialState(schema()), { type: "RESTORE", state: snapshot });
    expect(s).toBe(snapshot);
    expect(s.touched.type).toBe(true);
    expect(s.dirty).toBe(true);
  });

  it("VALIDATE_ALL surfaces only visible-field errors", () => {
    const reduce = createFormReducer(schema());
    const s0 = createInitialState(schema());
    const s1 = reduce(s0, { type: "VALIDATE_ALL" });
    // `type` is required and empty → error; `detail` is hidden → no error.
    expect(s1.errors.type).toEqual([expect.objectContaining({ rule: "required" })]);
    expect(s1.errors.detail).toBeUndefined();
  });

  it("FormStateManager class mirrors the reducer", () => {
    const mgr = new FormStateManager(schema(), { type: "office" });
    expect(mgr.getValue("type")).toBe("office");
    mgr.setValue("type", "rd");
    expect(mgr.getState().dirty).toBe(true);
    expect(mgr.getState().visibility.detail).toBe(true);
    mgr.reset();
    expect(mgr.getState().dirty).toBe(false);
  });
});
