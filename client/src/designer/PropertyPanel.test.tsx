import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldSchema } from "form-engine-core";
import { describe, expect, it, vi } from "vitest";
import { PropertyPanel, resolveSelected } from "./PropertyPanel";
import type { PropertyPanelProps } from "./PropertyPanel";
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

const sectionSchema = {
  schemaVersion: "1.0.0",
  sections: [{ id: "sec-1", title: "基础信息", fields: [] }],
};

const schemaWithField = {
  schemaVersion: "1.0.0",
  sections: [{ id: "sec-1", title: "基础信息", fields: [selectField, textField] }],
};

const selectedSection = {
  kind: "section" as const,
  section: { id: "sec-1", title: "基础信息", fields: [] },
};

function renderPanel(overrides: Partial<PropertyPanelProps> = {}) {
  const props: PropertyPanelProps = {
    schema: createEmptySchema(),
    selectedId: null,
    selected: null,
    chain: { nodes: [] },
    onChangeField: vi.fn(),
    onChangeSection: vi.fn(),
    onSelect: vi.fn(),
    onAddFieldToSection: vi.fn(),
    onRemoveSection: vi.fn(),
    onRemoveField: vi.fn(),
    onMoveField: vi.fn(),
    onReorderField: vi.fn(),
    onAddChainNode: vi.fn(),
    onRemoveChainNode: vi.fn(),
    onMoveChainNode: vi.fn(),
    onChangeChainNode: vi.fn(),
    ...overrides,
  };
  render(<PropertyPanel {...props} />);
  return props;
}

describe("PropertyPanel", () => {
  it("shows the structure tree by default", () => {
    renderPanel({
      schema: {
        schemaVersion: "1.0.0",
        sections: [{ id: "sec-1", title: "基础信息", fields: [] }],
      },
    });
    expect(screen.getByText("基础信息")).toBeInTheDocument();
  });

  it("shows a hint in the props tab when nothing is selected", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("tab", { name: "属性" }));
    expect(screen.getByText(/选择一个字段/)).toBeInTheDocument();
  });

  it("edits options via the options editor", async () => {
    const onChangeField = vi.fn();
    renderPanel({
      selected: { kind: "field", sectionId: "sec-1", field: selectField },
      onChangeField,
    });
    await userEvent.click(screen.getByRole("tab", { name: "属性" }));

    expect(screen.getByLabelText("选项1")).toHaveValue("选项一");
    await userEvent.click(screen.getByRole("button", { name: /添加选项/ }));

    expect(onChangeField).toHaveBeenCalledWith("sec-1", "fld-1", {
      options: [
        { label: "选项一", value: "option1" },
        { label: "选项二", value: "option2" },
        { label: "新选项", value: "option3" },
      ],
    });
  });

  it("writes a min-length rule via the validation editor", async () => {
    const onChangeField = vi.fn();
    renderPanel({
      selected: { kind: "field", sectionId: "sec-1", field: textField },
      onChangeField,
    });
    await userEvent.click(screen.getByRole("tab", { name: "属性" }));

    fireEvent.change(screen.getByPlaceholderText("最小"), {
      target: { value: "5" },
    });

    expect(onChangeField).toHaveBeenCalledWith("sec-1", "fld-2", {
      validation: {
        rules: [{ type: "minLength", value: 5 }],
      },
    });
  });

  it("adds an approval node from the chain tab", async () => {
    const onAddChainNode = vi.fn();
    renderPanel({ onAddChainNode });
    await userEvent.click(screen.getByRole("tab", { name: "审批链" }));
    await userEvent.click(screen.getByRole("button", { name: /添加审批节点/ }));
    expect(onAddChainNode).toHaveBeenCalled();
  });

  it("shows section properties when a section is selected", async () => {
    renderPanel({ schema: sectionSchema, selected: selectedSection });
    await userEvent.click(screen.getByRole("tab", { name: "属性" }));
    expect(screen.getByLabelText("章节标题")).toHaveValue("基础信息");
    expect(screen.getByLabelText("章节描述")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "可折叠" })).not.toBeChecked();
  });

  it("edits a section title via onChangeSection", async () => {
    const onChangeSection = vi.fn();
    renderPanel({ schema: sectionSchema, selected: selectedSection, onChangeSection });
    await userEvent.click(screen.getByRole("tab", { name: "属性" }));
    fireEvent.change(screen.getByLabelText("章节标题"), { target: { value: "员工信息" } });
    expect(onChangeSection).toHaveBeenCalledWith("sec-1", { title: "员工信息" });
  });

  it("shows the default-collapsed switch only when collapsible is on", async () => {
    renderPanel({
      schema: sectionSchema,
      selected: {
        kind: "section",
        section: { id: "sec-1", title: "基础信息", collapsible: true, fields: [] },
      },
    });
    await userEvent.click(screen.getByRole("tab", { name: "属性" }));
    expect(screen.getByRole("checkbox", { name: "可折叠" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "默认折叠" })).toBeInTheDocument();
  });
});

describe("resolveSelected", () => {
  it("resolves a field id to a field selection", () => {
    expect(resolveSelected(schemaWithField, "fld-2")).toEqual({
      kind: "field",
      sectionId: "sec-1",
      field: textField,
    });
  });

  it("resolves a section id to a section selection", () => {
    expect(resolveSelected(sectionSchema, "sec-1")).toEqual({
      kind: "section",
      section: { id: "sec-1", title: "基础信息", fields: [] },
    });
  });

  it("returns null for an unknown or absent id", () => {
    expect(resolveSelected(sectionSchema, "nope")).toBeNull();
    expect(resolveSelected(sectionSchema, null)).toBeNull();
  });
});
