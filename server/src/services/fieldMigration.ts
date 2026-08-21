import type { FormValues, ParsedSchema } from "form-engine-core";
import { topLevelFields } from "form-engine-core";

export interface FieldMigrationResult {
  /** Values whose fieldId still exists in the current schema. */
  values: FormValues;
  /** Values whose fieldId no longer exists, keyed by the original fieldId. */
  orphaned: Record<string, unknown>;
  /** True when at least one value was orphaned. */
  changed: boolean;
}

/**
 * Best-effort fieldId migration for the draft/template version-mismatch path
 * (ADR-0004, CONTEXT.md "Draft 版本不匹配"). When a template changes after a
 * draft was saved, values for fields that still exist are kept and values for
 * removed fields are moved into `_orphaned` so nothing is silently lost.
 *
 * A previous `_orphaned` object (from an earlier migration) is preserved and
 * merged with any newly-orphaned values.
 */
export function migrateFieldValues(
  fieldValues: FormValues,
  schema: ParsedSchema,
): FieldMigrationResult {
  const currentIds = new Set(topLevelFields(schema).map((f) => f.id));
  const values: FormValues = {};
  const orphaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fieldValues)) {
    if (key === "_orphaned") {
      Object.assign(orphaned, value as Record<string, unknown>);
      continue;
    }
    if (currentIds.has(key)) {
      values[key] = value;
    } else {
      orphaned[key] = value;
    }
  }

  // `changed` = "there is orphan data to surface", whether it moved during THIS
  // migration run or was preserved from an earlier one (the client echoes
  // `_orphaned` back on autosave). The filler keys its banner off this flag, so
  // a reload after autosave must keep showing it.
  return { values, orphaned, changed: Object.keys(orphaned).length > 0 };
}
