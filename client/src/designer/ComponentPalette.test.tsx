import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ComponentPalette } from "./ComponentPalette";

describe("ComponentPalette", () => {
  it("renders every field group and item", () => {
    render(<ComponentPalette onAddField={vi.fn()} />);
    expect(screen.getByText("布局组件")).toBeInTheDocument();
    expect(screen.getByText("基础控件")).toBeInTheDocument();
    expect(screen.getByText("章节容器")).toBeInTheDocument();
    expect(screen.getByText("文本输入")).toBeInTheDocument();
  });

  it("calls onAddField when an item is clicked", async () => {
    const onAddField = vi.fn();
    render(<ComponentPalette onAddField={onAddField} />);
    await userEvent.click(screen.getByRole("option", { name: "添加文本输入" }));
    expect(onAddField).toHaveBeenCalledWith("text");
  });

  it("calls onAddField when an item is keyboard-activated", async () => {
    const onAddField = vi.fn();
    render(<ComponentPalette onAddField={onAddField} />);
    screen.getByRole("option", { name: "添加文本输入" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onAddField).toHaveBeenCalledWith("text");
  });

  it("makes items draggable by default", () => {
    render(<ComponentPalette onAddField={vi.fn()} />);
    const item = screen.getByRole("option", { name: "添加文本输入" });
    expect(item).toHaveAttribute("draggable", "true");
  });

  it("readonly mode: items are not draggable and clicking does nothing", async () => {
    const onAddField = vi.fn();
    render(<ComponentPalette onAddField={onAddField} readonly />);

    const item = screen.getByRole("option", { name: "添加文本输入" });
    expect(item).toHaveAttribute("draggable", "false");
    expect(item).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(item);
    expect(onAddField).not.toHaveBeenCalled();
  });

  it("readonly mode: keyboard activation does nothing", async () => {
    const onAddField = vi.fn();
    render(<ComponentPalette onAddField={onAddField} readonly />);
    screen.getByRole("option", { name: "添加文本输入" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onAddField).not.toHaveBeenCalled();
  });
});
