import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { field, fieldProps } from "../testUtils";
import { FileUpload } from "./FileUpload";

function pdfFile(name = "合同.pdf", size = 1000): File {
  return new File([new Array(size).fill("x").join("")], name, {
    type: "application/pdf",
  });
}

describe("FileUpload", () => {
  it("accepts a valid file through onChange", () => {
    const onChange = vi.fn();
    render(
      <FileUpload
        {...fieldProps(field({ type: "file", label: "附件", allowTypes: ["pdf"] }), {
          onChange,
        })}
      />,
    );
    const input = screen.getByLabelText("附件");
    const file = pdfFile();

    fireEvent.change(input, { target: { files: [file] } });

    expect(onChange).toHaveBeenCalledWith([file]);
  });

  it("lists files already present in the value", () => {
    render(
      <FileUpload
        {...fieldProps(field({ type: "file", label: "附件" }), {
          value: [pdfFile()],
        })}
      />,
    );
    expect(screen.getByText("合同.pdf")).toBeInTheDocument();
  });

  it("intercepts files with a disallowed type", () => {
    const onChange = vi.fn();
    render(
      <FileUpload
        {...fieldProps(field({ type: "file", label: "附件", allowTypes: ["pdf"] }), {
          onChange,
        })}
      />,
    );
    const input = screen.getByLabelText("附件");
    const bad = new File(["x"], "evil.exe", { type: "application/octet-stream" });

    fireEvent.change(input, { target: { files: [bad] } });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/已拦截/)).toBeInTheDocument();
  });

  it("intercepts oversized files", () => {
    const onChange = vi.fn();
    render(
      <FileUpload
        {...fieldProps(field({ type: "file", label: "附件", maxSizeMB: 0.0001 }), {
          onChange,
        })}
      />,
    );
    const input = screen.getByLabelText("附件");
    const big = new File([new Array(2000).fill("x").join("")], "big.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(input, { target: { files: [big] } });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/已拦截/)).toBeInTheDocument();
  });

  it("intercepts files beyond maxCount", () => {
    const onChange = vi.fn();
    const existing = pdfFile("a.pdf");
    render(
      <FileUpload
        {...fieldProps(field({ type: "file", label: "附件", maxCount: 1 }), {
          value: [existing],
          onChange,
        })}
      />,
    );
    const input = screen.getByLabelText("附件");

    fireEvent.change(input, { target: { files: [pdfFile("b.pdf")] } });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/已拦截/)).toBeInTheDocument();
  });

  it("removes a file from the list", () => {
    const onChange = vi.fn();
    const existing = pdfFile("a.pdf");
    render(
      <FileUpload
        {...fieldProps(field({ type: "file", label: "附件" }), {
          value: [existing],
          onChange,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "移除 a.pdf" }));

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
