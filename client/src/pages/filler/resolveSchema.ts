import { parseSchema, type ApprovalChain } from "form-engine-core";
import type { InstanceDetail } from "./types";

/**
 * Resolve the schema an instance renders against (work order 05). A draft edits
 * the live template schema; a submitted instance renders the frozen snapshot so
 * later template edits can't change what was approved. Shared by the fill page
 * (FormFillPage) and the read-only preview modal (MySubmissions).
 */
export function resolveInstanceSchema(
  detail: InstanceDetail,
): ReturnType<typeof parseSchema> | null {
  const isDraft = detail.status === "draft";
  const rawSchema = isDraft
    ? detail.template.schema
    : (detail.template_snapshot as { schema?: unknown } | null | undefined)
        ?.schema ?? detail.template.schema;
  const chain = (detail.template.approval_chain ?? null) as
    | ApprovalChain
    | Record<string, never>
    | null;
  try {
    return parseSchema(rawSchema, chain ?? null);
  } catch {
    return null;
  }
}
