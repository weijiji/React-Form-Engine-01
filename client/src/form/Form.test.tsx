import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { parseSchema } from "form-engine-core";
import { Form } from "./Form";

const requiredSchema = parseSchema({
  schemaVersion: "1.0.0",
  sections: [
    {
      id: "s1",
      title: "基本信息",
      fields: [{ id: "name", type: "text", label: "姓名", required: true }],
    },
  ],
});

const linkedSchema = parseSchema({
  schemaVersion: "1.0.0",
  sections: [
    {
      id: "s1",
      title: "基本信息",
      fields: [
        {
          id: "type",
          type: "select",
          label: "类型",
          required: false,
          options: [
            { label: "研发", value: "rd" },
            { label: "办公", value: "office" },
          ],
        },
      ],
    },
    {
      id: "s2",
      title: "研发信息",
      visibilityCondition: { fieldId: "type", operator: "equals", value: "rd" },
      fields: [
        { id: "detail", type: "text", label: "详情", required: false },
        {
          id: "items",
          type: "subform",
          label: "明细",
          required: false,
          subSchema: {
            fields: [{ id: "name", type: "text", label: "名称", required: false }],
          },
        },
      ],
    },
  ],
});

describe("Form — form-level interactions", () => {
  it("shows inline validation feedback on blur", async () => {
    render(<Form schema={requiredSchema} />);

    fireEvent.blur(screen.getByLabelText(/姓名/));

    expect(await screen.findByText("该字段为必填项")).toBeInTheDocument();
  });

  it("cascades visibility: field → section → subfield", () => {
    render(<Form schema={linkedSchema} initialValues={{ type: "office" }} />);

    expect(screen.queryByText("研发信息")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/详情/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/类型/), { target: { value: "rd" } });

    expect(screen.getByText("研发信息")).toBeInTheDocument();
    expect(screen.getByLabelText(/详情/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("添加一行"));
    expect(screen.getByLabelText(/名称/)).toBeInTheDocument();
  });

  it("round-trips subform child values into a nested array", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const schema = parseSchema({
      schemaVersion: "1.0.0",
      sections: [
        {
          id: "s1",
          title: "明细",
          fields: [
            {
              id: "items",
              type: "subform",
              label: "明细",
              required: false,
              subSchema: {
                fields: [
                  { id: "name", type: "text", label: "名称", required: false },
                ],
              },
            },
          ],
        },
      ],
    });

    render(<Form schema={schema} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByText("添加一行"));
    fireEvent.change(screen.getByLabelText(/名称/), { target: { value: "苹果" } });
    fireEvent.click(screen.getByRole("button", { name: "提交" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ items: [{ name: "苹果" }] }),
    );
  });

  it("does not show the invalid hint before submit is attempted", () => {
    render(<Form schema={requiredSchema} />);

    expect(screen.queryByText("请先完成所有必填项")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "提交" }));

    expect(screen.getByText("请先完成所有必填项")).toBeInTheDocument();
  });

  it("scrolls to the first error for fields without an input id", () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView =
      scrollSpy as unknown as Element["scrollIntoView"];

    const schema = parseSchema({
      schemaVersion: "1.0.0",
      sections: [
        {
          id: "s1",
          title: "选择",
          fields: [
            {
              id: "choice",
              type: "radio",
              label: "选项",
              required: true,
              options: [{ label: "是", value: "yes" }],
            },
          ],
        },
      ],
    });

    render(<Form schema={schema} />);
    fireEvent.click(screen.getByRole("button", { name: "提交" }));

    // A radio group has no input `id`; the fallback must still find it via
    // `data-field-id` and scroll, rather than bailing out.
    expect(document.querySelector('[data-field-id="choice"]')).toBeInTheDocument();
    expect(scrollSpy).toHaveBeenCalled();
  });

  it("gates submit on validation and scrolls to the first error", async () => {
    const onSubmit = vi.fn();
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView =
      scrollSpy as unknown as Element["scrollIntoView"];

    render(<Form schema={requiredSchema} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "提交" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(scrollSpy).toHaveBeenCalled();
    expect(await screen.findByText("该字段为必填项")).toBeInTheDocument();
  });

  it("submits when every visible field validates", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<Form schema={requiredSchema} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/姓名/), { target: { value: "张三" } });
    fireEvent.click(screen.getByRole("button", { name: "提交" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: "张三" }));
  });
});
