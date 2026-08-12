/**
 * Small shared value helpers used by the engine modules.
 */

import type { FormValues } from "./types";

/** A value is "empty" when null/undefined, an empty string, or an empty array. */
export function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (value === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

/** Read a field value, returning `undefined` for missing keys (never throws). */
export function fieldValue(values: FormValues, fieldId: string): unknown {
  return Object.prototype.hasOwnProperty.call(values, fieldId)
    ? values[fieldId]
    : undefined;
}

/**
 * Compare two values for greaterThan/lessThan.
 * Returns a negative/zero/positive number, or `null` when incomparable.
 * Handles numbers, numeric strings, and strings (lexicographic — correct for
 * ISO date strings too).
 */
export function compareValues(left: unknown, right: unknown): number | null {
  if (left == null || right == null) return null;
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  if (typeof left === "string" && typeof right === "string") {
    const nl = Number(left);
    const nr = Number(right);
    if (Number.isFinite(nl) && Number.isFinite(nr)) return nl - nr;
    return left < right ? -1 : left > right ? 1 : 0;
  }
  return null;
}
