import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FieldSchema, FormAction, FormState } from "form-engine-core";
import type { ReactNode } from "react";
import { FormRenderContext } from "../context";
import { field, fieldProps } from "../testUtils";
import { SubForm } from "./SubForm";

const subformSchema = field({
  type: "subform",
  label: "明细",
  subSchema: {
    fields: [
      { id: "name", type: "text", label: "名称", required: false },
      { id: "qty", type: "number", label: "数量", required: false },
    ],
  },
});

function renderSubForm(
  props: Record<string, unknown> = {},
  renderField: (f: FieldSchema, path: string) => ReactNode = (_f, path) => (
    <span key={path} data-testid="child">
      {path}
    </span>
  ),
) {
  const contextValue = {
    state: {} as FormState,
    dispatch: vi.fn() as unknown as React.Dispatch<FormAction>,
    renderField,
  };
  return render(
    <FormRenderContext.Provider value={contextValue}>
      <SubForm {...fieldProps(subformSchema, props)} />
    </FormRenderContext.Provider>,
  );
}

describe("SubForm", () => {
  it("adds a row through onChange", () => {
    const onChange = vi.fn();
    renderSubForm({ value: [], onChange });

    fireEvent.click(screen.getByText("添加一行"));

    expect(onChange).toHaveBeenCalledWith([{}]);
  });

  it("removes a row through onChange", () => {
    const onChange = vi.fn();
    renderSubForm({ value: [{ name: "A", qty: 1 }], onChange });

    fireEvent.click(screen.getByRole("button", { name: "删除第 1 行" }));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("renders child fields with row-indexed paths", () => {
    const renderField = vi.fn(
      (_f: FieldSchema, path: string) => (
        <span key={path} data-testid="child">
          {path}
        </span>
      ),
    );
    renderSubForm({ value: [{}, {}] }, renderField);

    expect(renderField).toHaveBeenCalledWith(
      expect.objectContaining({ id: "name" }),
      "f1.0.name",
    );
    expect(renderField).toHaveBeenCalledWith(
      expect.objectContaining({ id: "name" }),
      "f1.1.name",
    );
  });
});
