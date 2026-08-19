import { render, screen, within } from "@testing-library/react";
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
        { id: "fld-1", type: "text", label: "姓名", required: true },
        { id: "fld-2", type: "select", label: "部门", required: false },
      ],
    },
  ],
};

function renderCanvas(overrides: Partial<Parameters<typeof DesignCanvas>[0]> = {}) {
  const props = {
    schema,
    templateName: "员工入职信息登记表",
    selectedId: null,
    mode: "static" as const,
    onSelect: vi.fn(),
    onDropField: vi.fn(),
    onRemoveField: vi.fn(),
    onDuplicateField: vi.fn(),
    onRemoveSection: vi.fn(),
    onAddSection: vi.fn(),
    ...overrides,
  };
  render(<DesignCanvas {...props} />);
  return props;
}

describe("DesignCanvas", () => {
  it("renders the template name and fill hint in the canvas head", () => {
    renderCanvas();
    expect(
      screen.getByRole("heading", { name: "员工入职信息登记表" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/请完整填写以下信息/)).toBeInTheDocument();
  });

  it("renders section titles and field labels", () => {
    renderCanvas();
    expect(screen.getByText("基础信息")).toBeInTheDocument();
    expect(screen.getByText("部门")).toBeInTheDocument();
    expect(screen.getByText(/姓名/)).toBeInTheDocument();
    expect(screen.getByText("2 个字段")).toBeInTheDocument();
  });

  it("selects a field on click", async () => {
    const { onSelect } = renderCanvas();
    await userEvent.click(screen.getByText("部门"));
    expect(onSelect).toHaveBeenCalledWith("fld-2");
  });

  it("removes a field via the delete tool", async () => {
    const { onRemoveField } = renderCanvas();
    await userEvent.click(screen.getAllByRole("button", { name: "删除" })[0]);
    expect(onRemoveField).toHaveBeenCalledWith("sec-1", "fld-1");
  });

  it("duplicates a field via the copy tool", async () => {
    const { onDuplicateField } = renderCanvas();
    await userEvent.click(screen.getAllByRole("button", { name: "复制" })[0]);
    expect(onDuplicateField).toHaveBeenCalledWith("sec-1", "fld-1");
  });

  it("removes a section via the section tool", async () => {
    const { onRemoveSection } = renderCanvas();
    await userEvent.click(screen.getByRole("button", { name: "删除章节" }));
    expect(onRemoveSection).toHaveBeenCalledWith("sec-1");
  });

  it("shows the empty state and add-section button when empty", async () => {
    const { onAddSection } = renderCanvas({
      schema: { schemaVersion: "1.0.0", sections: [] },
    });
    expect(screen.getByText(/画布为空/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "添加章节" }));
    expect(onAddSection).toHaveBeenCalled();
  });

  it("readonly mode hides field and section editing tools", () => {
    renderCanvas({ readonly: true });
    expect(screen.queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "复制" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "删除章节" }),
    ).not.toBeInTheDocument();
  });

  it("readonly mode hides the empty-state add-section button", () => {
    renderCanvas({
      schema: { schemaVersion: "1.0.0", sections: [] },
      readonly: true,
    });
    expect(screen.getByText(/画布为空/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "添加章节" }),
    ).not.toBeInTheDocument();
  });

  it("readonly mode still renders sections and fields (preview only)", () => {
    renderCanvas({ readonly: true });
    expect(screen.getByText("基础信息")).toBeInTheDocument();
    expect(screen.getByText(/姓名/)).toBeInTheDocument();
  });

  it("test mode renders the interactive Form engine inside the canvas-form wrapper", () => {
    const { container } = render(
      <DesignCanvas
        schema={schema}
        templateName="员工入职信息登记表"
        selectedId={null}
        mode="test"
        onSelect={vi.fn()}
        onDropField={vi.fn()}
        onRemoveField={vi.fn()}
        onDuplicateField={vi.fn()}
        onRemoveSection={vi.fn()}
        onAddSection={vi.fn()}
      />,
    );
    // 画布头部与静态预览共用（含模板名 + 必填提示）
    expect(screen.getByText(/请完整填写以下信息/)).toBeInTheDocument();
    // 真 Form 引擎在 .canvas-form 作用域内渲染（对齐静态预览视觉）
    expect(container.querySelector(".canvas-form .form-engine")).not.toBeNull();
    expect(within(container).getByText("基础信息")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交" })).toBeInTheDocument();
  });
});
