/**
 * FormEngine core — pure-logic modules (zero runtime dependencies).
 */

export * from "./types";
export * from "./api";
export * from "./schemaParser";
export * from "./conditionEvaluator";
export * from "./validationEngine";
export * from "./visibilityEngine";
export * from "./formStateManager";
export * from "./approvalStateMachine";
export * from "./approvalResolver";

export { compareValues, fieldValue, isEmptyValue } from "./values";
export { childFields, topLevelFields } from "./fields";
