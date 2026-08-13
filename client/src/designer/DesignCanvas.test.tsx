import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DesignCanvas } from "./DesignCanvas";
import type { DesignerSchema } from "./schemaModel";

const schema: DesignerSchema = {
  schemaVersion: "1.0.0",
  sections: [
    {
      id: "sec-1",
      title: "基础信息",
      fields: [
        { id: "fld-1", type: "text", label: "姓名", required: false },
        { id: "fld-2", type: "select", label: "部门", required: false },
      ],
    },
  ],
};

function renderCanvas(overrides: Partial<Parameters<typeof DesignCanvas>[0]> = {}) {
  const props = {
    schema,
    selectedFieldId: null,
    onDropField: vi.fn(),
    onSelectField: vi.fn(),
    onMoveField: vi.fn(),
    onReorderField: vi.fn(),
    onRemoveField: vi.fn(),
    onAddSection: vi.fn(),
    onUpdateSectionTitle: vi.fn(),
    ...overrides,
  };
  render(<DesignCanvas {...props} />);
  return props;
}

describe("DesignCanvas", () => {
  it("renders section title, field labels and type names", () => {
    renderCanvas();
    expect(screen.getByDisplayValue("基础信息")).toBeInTheDocument();
    expect(screen.getByText("姓名")).toBeInTheDocument();
    expect(screen.getByText("部门")).toBeInTheDocument();
    expect(screen.getAllByText("单行文本")).toHaveLength(1);
  });

  it("selects a field on click", async () => {
    const { onSelectField } = renderCanvas();
    await userEvent.click(screen.getByText("姓名"));
    expect(onSelectField).toHaveBeenCalledWith("fld-1");
  });

  it("moves a field down via the down button", async () => {
    const { onMoveField } = renderCanvas();
    await userEvent.click(screen.getAllByLabelText("下移")[0]);
    expect(onMoveField).toHaveBeenCalledWith("sec-1", "fld-1", 1);
  });

  it("removes a field", async () => {
    const { onRemoveField } = renderCanvas();
    await userEvent.click(screen.getAllByLabelText("删除字段")[0]);
    expect(onRemoveField).toHaveBeenCalledWith("sec-1", "fld-1");
  });

  it("adds a section", async () => {
    const { onAddSection } = renderCanvas();
    await userEvent.click(screen.getByText("+ 添加章节"));
    expect(onAddSection).toHaveBeenCalled();
  });
});
