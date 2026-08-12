import { describe, expect, it } from "vitest";
import { evaluate } from "../src/conditionEvaluator";
import type { ConditionNode, FormValues } from "../src/types";

const V: FormValues = {
  deviceType: "rd",
  isClassified: true,
  qty: 5,
  startDate: "2026-01-01",
  tags: ["a", "b", "c"],
  empty: "",
  nil: null,
};

describe("ConditionEvaluator", () => {
  describe("equals / notEquals", () => {
    it("equals matches equal scalar values", () => {
      expect(evaluate({ fieldId: "deviceType", operator: "equals", value: "rd" }, V)).toBe(true);
      expect(evaluate({ fieldId: "deviceType", operator: "equals", value: "office" }, V)).toBe(false);
      expect(evaluate({ fieldId: "isClassified", operator: "equals", value: true }, V)).toBe(true);
    });

    it("notEquals inverts", () => {
      expect(evaluate({ fieldId: "deviceType", operator: "notEquals", value: "office" }, V)).toBe(true);
      expect(evaluate({ fieldId: "deviceType", operator: "notEquals", value: "rd" }, V)).toBe(false);
    });
  });

  describe("contains / notContains", () => {
    it("contains works on strings", () => {
      expect(evaluate({ fieldId: "deviceType", operator: "contains", value: "d" }, V)).toBe(true);
      expect(evaluate({ fieldId: "deviceType", operator: "contains", value: "x" }, V)).toBe(false);
    });

    it("contains works on arrays", () => {
      expect(evaluate({ fieldId: "tags", operator: "contains", value: "b" }, V)).toBe(true);
      expect(evaluate({ fieldId: "tags", operator: "contains", value: "z" }, V)).toBe(false);
    });

    it("notContains inverts", () => {
      expect(evaluate({ fieldId: "tags", operator: "notContains", value: "z" }, V)).toBe(true);
      expect(evaluate({ fieldId: "tags", operator: "notContains", value: "a" }, V)).toBe(false);
    });
  });

  describe("greaterThan / lessThan", () => {
    it("compares numbers", () => {
      expect(evaluate({ fieldId: "qty", operator: "greaterThan", value: 3 }, V)).toBe(true);
      expect(evaluate({ fieldId: "qty", operator: "greaterThan", value: 5 }, V)).toBe(false);
      expect(evaluate({ fieldId: "qty", operator: "lessThan", value: 10 }, V)).toBe(true);
    });

    it("compares numeric strings numerically", () => {
      const values = { n: "10" };
      expect(evaluate({ fieldId: "n", operator: "greaterThan", value: "9" }, values)).toBe(true);
    });

    it("compares ISO date strings lexicographically", () => {
      const values = { end: "2026-07-15", start: "2026-01-01" };
      expect(evaluate({ fieldId: "end", operator: "greaterThan", value: "2026-01-01" }, values)).toBe(true);
    });
  });

  describe("isEmpty / isNotEmpty", () => {
    it("detects empty string, empty array, null and missing", () => {
      expect(evaluate({ fieldId: "empty", operator: "isEmpty" }, V)).toBe(true);
      expect(evaluate({ fieldId: "nil", operator: "isEmpty" }, V)).toBe(true);
      expect(evaluate({ fieldId: "missing", operator: "isEmpty" }, V)).toBe(true);
      expect(evaluate({ fieldId: "deviceType", operator: "isEmpty" }, V)).toBe(false);
    });

    it("isNotEmpty inverts", () => {
      expect(evaluate({ fieldId: "deviceType", operator: "isNotEmpty" }, V)).toBe(true);
      expect(evaluate({ fieldId: "empty", operator: "isNotEmpty" }, V)).toBe(false);
    });
  });

  describe("in / notIn", () => {
    it("in checks membership in an array", () => {
      expect(evaluate({ fieldId: "deviceType", operator: "in", value: ["rd", "office"] }, V)).toBe(true);
      expect(evaluate({ fieldId: "deviceType", operator: "in", value: ["office"] }, V)).toBe(false);
    });

    it("notIn inverts", () => {
      expect(evaluate({ fieldId: "deviceType", operator: "notIn", value: ["office"] }, V)).toBe(true);
      expect(evaluate({ fieldId: "deviceType", operator: "notIn", value: ["rd"] }, V)).toBe(false);
    });

    it("in with a non-array value is false", () => {
      expect(evaluate({ fieldId: "deviceType", operator: "in", value: "rd" }, V)).toBe(false);
    });
  });

  describe("graceful handling of missing field / null value", () => {
    it("never throws and returns a safe false for value comparisons", () => {
      const missing: FormValues = {};
      const cases: ConditionNode[] = [
        { fieldId: "x", operator: "equals", value: "a" },
        { fieldId: "x", operator: "notEquals", value: "a" },
        { fieldId: "x", operator: "contains", value: "a" },
        { fieldId: "x", operator: "greaterThan", value: 1 },
        { fieldId: "x", operator: "lessThan", value: 1 },
        { fieldId: "x", operator: "in", value: ["a"] },
      ];
      for (const c of cases) {
        expect(() => evaluate(c, missing)).not.toThrow();
      }
    });

    it("treats a null field value as empty for isEmpty", () => {
      expect(evaluate({ fieldId: "nil", operator: "isEmpty" }, V)).toBe(true);
    });
  });

  describe("AND composition (MVP)", () => {
    it("a condition array is an implicit AND", () => {
      const cond: ConditionNode[] = [
        { fieldId: "deviceType", operator: "equals", value: "rd" },
        { fieldId: "isClassified", operator: "equals", value: true },
      ];
      expect(evaluate(cond, V)).toBe(true);
      expect(evaluate([cond[0], { fieldId: "isClassified", operator: "equals", value: false }], V)).toBe(false);
    });

    it("an AndCondition node groups with AND", () => {
      const cond: ConditionNode = {
        conditions: [
          { fieldId: "deviceType", operator: "equals", value: "rd" },
          { fieldId: "qty", operator: "greaterThan", value: 2 },
        ],
      };
      expect(evaluate(cond, V)).toBe(true);
    });

    it("an explicit type: 'and' is accepted", () => {
      const cond: ConditionNode = {
        type: "and",
        conditions: [{ fieldId: "deviceType", operator: "equals", value: "rd" }],
      };
      expect(evaluate(cond, V)).toBe(true);
    });

    it("an empty AND group is vacuously true", () => {
      expect(evaluate({ conditions: [] }, V)).toBe(true);
      expect(evaluate([], V)).toBe(true);
    });
  });

  describe("OR is rejected in the MVP", () => {
    it("throws on type: 'or'", () => {
      const cond: ConditionNode = {
        type: "or",
        conditions: [{ fieldId: "deviceType", operator: "equals", value: "rd" }],
      };
      expect(() => evaluate(cond, V)).toThrow(/OR conditions are not supported/);
    });
  });
});
