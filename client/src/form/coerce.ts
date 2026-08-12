/**
 * Small value-coercion helpers shared by the field components. A field value is
 * `unknown` at the contract boundary; each control narrows it to the shape it
 * actually renders and treats everything else as "empty".
 */

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function numberValue(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

/** Maps a raw number-input string to its typed value, treating empty as "cleared". */
export function parseNumberInput(raw: string): number | undefined {
  return raw === "" ? undefined : Number(raw);
}

export function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

export function objectArrayValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null)
    : [];
}
