/**
 * VisibilityEngine — computes field/section visibility from a ParsedSchema and
 * the current values, and supports incremental recomputation via a dependency
 * graph.
 *
 * Visibility semantics:
 *  - a section is visible iff its own `visibilityCondition` (if any) passes;
 *  - a field is visible iff its parent section is visible AND its own condition
 *    passes;
 *  - a subform child field is visible iff its parent subform field is visible
 *    AND its own condition passes. When a field (or section) becomes invisible,
 *    all of its descendant fields are hidden too.
 *
 * Scope: visibility is computed per field/section *definition*, not per subform
 * row. Conditions reference field ids in the top-level `values` map.
 */

import type {
  ConditionNode,
  FieldSchema,
  FormValues,
  ParsedSchema,
} from "./types";
import { evaluate } from "./conditionEvaluator";
import { childFields } from "./fields";

export type VisibilityMap = Record<string, boolean>;

interface VisibilityNode {
  id: string;
  depth: number;
  parentId: string | null;
  condition: ConditionNode | null;
  childNodeIds: string[];
}

export interface DependencyGraph {
  /** fieldId → node ids whose visibility condition references that fieldId */
  dependents: Map<string, Set<string>>;
  /** nodeId → node metadata */
  nodes: Map<string, VisibilityNode>;
}

function collectConditionFieldIds(
  condition: ConditionNode | null,
  out: Set<string>,
): void {
  if (!condition) return;
  if (Array.isArray(condition)) {
    for (const c of condition) collectConditionFieldIds(c, out);
    return;
  }
  if ("conditions" in condition) {
    for (const c of condition.conditions) collectConditionFieldIds(c, out);
    return;
  }
  if ("fieldId" in condition) out.add(condition.fieldId);
}

function addDependents(
  graph: DependencyGraph,
  nodeId: string,
  condition: ConditionNode | null,
): void {
  const fieldIds = new Set<string>();
  collectConditionFieldIds(condition, fieldIds);
  for (const fieldId of fieldIds) {
    let set = graph.dependents.get(fieldId);
    if (!set) {
      set = new Set();
      graph.dependents.set(fieldId, set);
    }
    set.add(nodeId);
  }
}

function registerFieldTree(
  graph: DependencyGraph,
  fields: FieldSchema[],
  parentId: string | null,
  depth: number,
  keyPrefix: string,
): void {
  for (const field of fields) {
    const nodeId = keyPrefix ? `${keyPrefix}.${field.id}` : field.id;
    const childNodeIds: string[] = [];

    graph.nodes.set(nodeId, {
      id: nodeId,
      depth,
      parentId,
      condition: field.visibilityCondition ?? null,
      childNodeIds,
    });
    addDependents(graph, nodeId, field.visibilityCondition ?? null);

    if (field.type === "subform") {
      const children = childFields(field);
      for (const child of children) childNodeIds.push(`${nodeId}.${child.id}`);
      registerFieldTree(graph, children, nodeId, depth + 1, nodeId);
    }
  }
}

/**
 * Build the dependency graph for a parsed schema: maps every referenced field
 * id to the nodes whose visibility depends on it.
 */
export function buildDependencyGraph(schema: ParsedSchema): DependencyGraph {
  const graph: DependencyGraph = { dependents: new Map(), nodes: new Map() };

  for (const section of schema.sections) {
    const sectionNodeId = section.id;
    graph.nodes.set(sectionNodeId, {
      id: sectionNodeId,
      depth: 0,
      parentId: null,
      condition: section.visibilityCondition ?? null,
      childNodeIds: section.fields.map((f) => f.id),
    });
    addDependents(graph, sectionNodeId, section.visibilityCondition ?? null);

    registerFieldTree(graph, section.fields, sectionNodeId, 1, "");
  }

  return graph;
}

function resolveVisible(
  graph: DependencyGraph,
  nodeId: string,
  values: FormValues,
  vis: VisibilityMap,
): boolean {
  const node = graph.nodes.get(nodeId);
  if (!node) return true;
  const parentVisible = node.parentId === null || vis[node.parentId] !== false;
  if (!parentVisible) return false;
  if (!node.condition) return true;
  return evaluate(node.condition, values);
}

/** Compute the full visibility map for all sections and fields. */
export function computeVisibility(schema: ParsedSchema, values: FormValues): VisibilityMap {
  const graph = buildDependencyGraph(schema);
  const vis: VisibilityMap = {};

  const ordered = [...graph.nodes.keys()].sort(
    (a, b) => (graph.nodes.get(a)?.depth ?? 0) - (graph.nodes.get(b)?.depth ?? 0),
  );

  for (const nodeId of ordered) {
    vis[nodeId] = resolveVisible(graph, nodeId, values, vis);
  }

  return vis;
}

/**
 * Recompute visibility after a single field value change. Only nodes on the
 * dependency chain of `changedFieldId` (plus their descendants) are revisited.
 */
export function recalculateVisibility(
  schema: ParsedSchema,
  values: FormValues,
  changedFieldId: string,
  previous: VisibilityMap,
): { visibility: VisibilityMap; affected: string[] } {
  const graph = buildDependencyGraph(schema);
  const next: VisibilityMap = { ...previous };
  const affected: string[] = [];

  // 1. Transitive closure of nodes whose conditions reference the changed field.
  const toRecompute = new Set<string>();
  const queue: string[] = [changedFieldId];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const fieldId = queue.shift()!;
    for (const nodeId of graph.dependents.get(fieldId) ?? []) {
      if (toRecompute.has(nodeId)) continue;
      toRecompute.add(nodeId);
      queue.push(nodeId); // a field node's own id may itself be referenced by others
    }
    seen.add(fieldId);
  }

  // 2. Include descendants of any affected parent (hidden parent → hidden child).
  const stack = [...toRecompute];
  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    const node = graph.nodes.get(nodeId);
    if (!node) continue;
    for (const childId of node.childNodeIds) {
      if (!toRecompute.has(childId)) {
        toRecompute.add(childId);
        stack.push(childId);
      }
    }
  }

  // 3. Recompute in depth order so parents are resolved before children.
  const ordered = [...toRecompute].sort(
    (a, b) => (graph.nodes.get(a)?.depth ?? 0) - (graph.nodes.get(b)?.depth ?? 0),
  );

  for (const nodeId of ordered) {
    const visible = resolveVisible(graph, nodeId, values, next);
    if (next[nodeId] !== visible) {
      next[nodeId] = visible;
      affected.push(nodeId);
    }
  }

  return { visibility: next, affected };
}
