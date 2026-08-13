import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldSchema } from "form-engine-core";
import { describe, expect, it, vi } from "vitest";
import { PropertyPanel } from "./PropertyPanel";
import { createEmptySchema } from "./schemaModel";

const selectField: FieldSchema = {
  id: "fld-1",
  type: "select",
  label: "部门",
  required: false,
  options: [
    { label: "选项一", value: "option1" },
    { label: "选项二", value: "option2" },
  ],
};

const textField: FieldSchema = {
  id: "fld-2",
  type: "text",
  label: "姓名",
  required: false,
};

describe("PropertyPanel", () => {
  it("shows a hint when no field is selected", () => {
    render(
      <PropertyPanel
        schema={createEmptySchema()}
        selected={null}
        onChangeField={vi.fn()}
      />,
    );
    expect(screen.getByText("请选择一个字段以编辑属性")).toBeInTheDocument();
  });

  it("edits options via the options editor", async () => {
    const onChangeField = vi.fn();
    render(
      <PropertyPanel
        schema={createEmptySchema()}
        selected={{ sectionId: "sec-1", field: selectField }}
        onChangeField={onChangeField}
      />,
    );

    expect(screen.getByLabelText("选项1标签")).toHaveValue("选项一");
    await userEvent.click(screen.getByText("+ 添加选项"));

    expect(onChangeField).toHaveBeenCalledWith("sec-1", "fld-1", {
      options: [
        { label: "选项一", value: "option1" },
        { label: "选项二", value: "option2" },
        { label: "新选项", value: "option3" },
      ],
    });
  });

  it("writes text validation rules via setRule", async () => {
    const onChangeField = vi.fn();
    render(
      <PropertyPanel
        schema={createEmptySchema()}
        selected={{ sectionId: "sec-1", field: textField }}
        onChangeField={onChangeField}
      />,
    );

    await userEvent.type(screen.getByLabelText("最小长度"), "5");
    expect(onChangeField).toHaveBeenCalledWith("sec-1", "fld-2", {
      validation: {
        rules: [{ type: "minLength", value: 5 }],
      },
    });
  });

  it("switches tabs to approval chain and preview", async () => {
    render(
      <PropertyPanel
        schema={createEmptySchema()}
        selected={null}
        onChangeField={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("tab", { name: "审批链" }));
    expect(screen.getByText(/无审批链/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "预览" }));
    expect(screen.getByText("暂无字段可预览")).toBeInTheDocument();
  });
});
