import { createContext } from "react";
import type { Dispatch, ReactNode } from "react";
import type {
  FieldSchema,
  FormAction,
  FormState,
  OrgDataSource,
} from "form-engine-core";

/**
 * Rendering context threaded through the recursive renderer. `renderField` lets
 * container components (SubForm) render arbitrary descendant fields without
 * re-implementing value/error/visibility plumbing.
 */
export interface FormRenderContextValue {
  state: FormState;
  dispatch: Dispatch<FormAction>;
  renderField: (field: FieldSchema, path: string) => ReactNode;
}

export const FormRenderContext = createContext<FormRenderContextValue | null>(null);

/**
 * App-level dependencies. `orgDataSource` backs UserPicker and is injected at the
 * Form root; it defaults to `null` (UserPicker renders an "unavailable" state).
 */
export interface FormEngineContextValue {
  orgDataSource: OrgDataSource | null;
}

export const FormEngineContext = createContext<FormEngineContextValue>({
  orgDataSource: null,
});
