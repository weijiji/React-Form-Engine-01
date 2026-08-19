import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./Pagination";

describe("Pagination", () => {
  it("renders the current page and total pages", () => {
    render(<Pagination page={2} pageSize={20} total={50} onChange={() => {}} />);
    expect(screen.getByText("第 2 / 3 页")).toBeInTheDocument();
  });

  it("clamps the total page count to at least 1", () => {
    render(<Pagination page={1} pageSize={20} total={0} onChange={() => {}} />);
    expect(screen.getByText("第 1 / 1 页")).toBeInTheDocument();
  });

  it("disables 上一页 on the first page and 下一页 on the last", () => {
    const { rerender } = render(
      <Pagination page={1} pageSize={20} total={50} onChange={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下一页" })).toBeEnabled();

    rerender(<Pagination page={3} pageSize={20} total={50} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "上一页" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  });

  it("reports the next page on click", () => {
    const onChange = vi.fn();
    render(<Pagination page={1} pageSize={20} total={50} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });
});
