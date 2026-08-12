/**
 * ConditionEvaluator — evaluates a condition node against the current values.
 *
 * MVP scope (ADR-0006): only AND composition (a condition array is an implicit
 * AND; an `AndCondition` node groups its `conditions` with AND). OR nodes are
 * rejected — they are a Phase 2 feature.
 *
 * All operators are defensive: a missing field or a null value never throws.
 */

import type {
  AndCondition,
  ConditionNode,
  ConditionOperator,
  FormValues,
  LeafCondition,
} from "./types";
import { compareValues, fieldValue, isEmptyValue } from "./values";

export function isLeafCondition(node: ConditionNode): node is LeafCondition {
  return (
    typeof node === "object" &&
    node !== null &&
    "fieldId" in node &&
    "operator" in node
  );
}

export function isAndCondition(node: ConditionNode): node is AndCondition {
  return (
    typeof node === "object" &&
    node !== null &&
    "conditions" in node &&
    Array.isArray((node as AndCondition).conditions)
  );
}

/**
 * Evaluate a single operator against an actual value and an expected value.
 * Shared by the condition evaluator and cross-field validation so the two stay
 * in lockstep (a crossField rule reuses the same 10 operators).
 */
export function evaluateOperator(
  operator: ConditionOperator,
  actual: unknown,
  expected: unknown,
): boolean {
  switch (operator) {
    case "equals":
      return actual === expected;
    case "notEquals":
      return actual !== expected;
    case "contains":
      if (typeof actual === "string" && typeof expected === "string") {
        return actual.includes(expected);
      }
      if (Array.isArray(actual)) {
        return actual.includes(expected);
      }
      return false;
    case "notContains":
      return !evaluateOperator("contains", actual, expected);
    case "greaterThan": {
      const c = compareValues(actual, expected);
      return c !== null && c > 0;
    }
    case "lessThan": {
      const c = compareValues(actual, expected);
      return c !== null && c < 0;
    }
    case "isEmpty":
      return isEmptyValue(actual);
    case "isNotEmpty":
      return !isEmptyValue(actual);
    case "in":
      return Array.isArray(expected) ? expected.includes(actual) : false;
    case "notIn":
      return Array.isArray(expected) ? !expected.includes(actual) : true;
    default: {
      // Exhaustive — but guard against unknown operators at runtime.
      const _exhaustive: never = operator;
      return _exhaustive as boolean;
    }
  }
}

function evaluateLeaf(leaf: LeafCondition, values: FormValues): boolean {
  return evaluateOperator(leaf.operator, fieldValue(values, leaf.fieldId), leaf.value);
}

/**
 * Evaluate a condition (or condition array, treated as AND) against `values`.
 */
export function evaluate(
  condition: ConditionNode | ConditionNode[],
  values: FormValues,
): boolean {
  if (Array.isArray(condition)) {
    return condition.every((node) => evaluate(node, values));
  }

  if (isAndCondition(condition)) {
    if (condition.type === "or") {
      throw new Error("OR conditions are not supported in the MVP (see ADR-0006)");
    }
    return condition.conditions.every((node) => evaluate(node, values));
  }

  return evaluateLeaf(condition, values);
}
