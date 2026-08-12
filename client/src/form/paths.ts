import type { FormValues } from "form-engine-core";

/**
 * Path helpers for navigating the flat-ish value map. Top-level fields are keyed
 * by their own id; subform children use a dotted path with row indexes, e.g.
 * `"subformId.0.childId"`. The engine stores subform values as nested arrays of
 * row objects, so these helpers translate between a dotted path and that shape.
 */

/** The definition-level key of a dotted path (row indexes stripped). */
export function definitionKey(path: string): string {
  return path
    .split(".")
    .filter((part) => !/^\d+$/.test(part))
    .join(".");
}

/** Read a value at a dotted path, returning `undefined` for missing segments. */
export function getValueAtPath(values: FormValues, path: string): unknown {
  let current: unknown = values;
  for (const part of path.split(".")) {
    if (current == null) return undefined;
    if (Array.isArray(current)) {
      current = current[Number(part)];
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Return a new values map with `value` written at `path`. The whole chain is
 * cloned (immutably) so the caller can hand the root segment back to the engine.
 */
export function setValueAtPath(
  values: FormValues,
  path: string,
  value: unknown,
): FormValues {
  const parts = path.split(".");
  const rootKey = parts[0];
  if (parts.length === 1) {
    return { ...values, [rootKey]: value };
  }
  return { ...values, [rootKey]: updateAt(values[rootKey], parts.slice(1), value) };
}

function updateAt(node: unknown, parts: string[], value: unknown): unknown {
  if (parts.length === 0) return value;
  const [head, ...rest] = parts;
  if (Array.isArray(node)) {
    const next = node.slice();
    next[Number(head)] = updateAt(next[Number(head)], rest, value);
    return next;
  }
  const obj = (
    node && typeof node === "object" ? node : {}
  ) as Record<string, unknown>;
  return { ...obj, [head]: updateAt(obj[head], rest, value) };
}
