/**
 * Field/section traversal helpers shared by validation, visibility and state.
 */

import type { FieldSchema, ParsedSchema } from "./types";

/** All fields across every section (depth 0 of the schema). */
export function topLevelFields(schema: ParsedSchema): FieldSchema[] {
  return schema.sections.flatMap((section) => section.fields);
}

/** Child fields of a subform field (empty for non-subform fields). */
export function childFields(field: FieldSchema): FieldSchema[] {
  return field.subSchema?.fields ?? [];
}
