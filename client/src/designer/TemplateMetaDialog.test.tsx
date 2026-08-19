import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TemplateMetaDialog, type TemplateMeta } from "./TemplateMetaDialog";

const initial: TemplateMeta = {
  name: "入职登记",
  description: "新员工入职信息采集",
  category: "人力资源",
};

function renderOpen(overrides: Partial<Parameters<typeof TemplateMetaDialog>[0]> = {}) {
  return render(
    <TemplateMetaDialog
      open
      initial={initial}
      busy={false}
      error={null}
      onClose={vi.fn()}
      onSubmit={vi.fn()}
      {...overrides}
    />,
  );
}

describe("TemplateMetaDialog", () => {
  it("renders nothing when closed", () => {
    render(
      <TemplateMetaDialog
        open={false}
        initial={initial}
        busy={false}
        error={null}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByText("编辑基本信息")).not.toBeInTheDocument();
  });

  it("renders the initial values into the form", () => {
    renderOpen();
    expect(screen.getByText("编辑基本信息")).toBeInTheDocument();
    expect(screen.getByLabelText("模板名称")).toHaveValue("入职登记");
    expect(screen.getByLabelText("模板描述")).toHaveValue("新员工入职信息采集");
    expect(screen.getByLabelText("模板分类")).toHaveValue("人力资源");
  });

  it("rejects a blank name without submitting", async () => {
    const onSubmit = vi.fn();
    renderOpen({ onSubmit });
    await userEvent.clear(screen.getByLabelText("模板名称"));
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByText("请输入模板名称")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a missing category without submitting", async () => {
    const onSubmit = vi.fn();
    renderOpen({ onSubmit });
    await userEvent.selectOptions(screen.getByLabelText("模板分类"), "");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByText("请选择模板分类")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a trimmed name/description with the chosen category", async () => {
    const onSubmit = vi.fn();
    renderOpen({ onSubmit });
    await userEvent.clear(screen.getByLabelText("模板名称"));
    await userEvent.type(screen.getByLabelText("模板名称"), "  新名字 ");
    await userEvent.clear(screen.getByLabelText("模板描述"));
    await userEvent.type(screen.getByLabelText("模板描述"), "  用途说明 ");
    await userEvent.selectOptions(screen.getByLabelText("模板分类"), "财务");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "新名字",
      description: "用途说明",
      category: "财务",
    });
  });

  it("normalizes a blank description to null", async () => {
    const onSubmit = vi.fn();
    renderOpen({ onSubmit });
    await userEvent.clear(screen.getByLabelText("模板描述"));
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "入职登记",
      description: null,
      category: "人力资源",
    });
  });

  it("shows the server error surfaced from the parent", () => {
    renderOpen({ error: "模板已被他人签出" });
    expect(screen.getByText("模板已被他人签出")).toBeInTheDocument();
  });

  it("calls onClose from the cancel button and the header close", async () => {
    const onClose = vi.fn();
    renderOpen({ onClose });
    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    await userEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
