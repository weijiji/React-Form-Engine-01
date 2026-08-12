import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parseSchema } from "form-engine-core";
import { Form } from "./Form";

// Note: jsdom performs no layout, so this is a *structural* regression guard —
// the components must not hard-code pixel widths that overflow a 375px viewport
// (they use percentage/flex sizing via `.form-engine`/`.form-control`). True
// visual overflow detection belongs to the E2E journey (#4, mobile browser).
describe("mobile (375px) rendering", () => {
  it("renders a full form with no hard-coded overflow widths", () => {
    Object.defineProperty(window, "innerWidth", {
      value: 375,
      configurable: true,
      writable: true,
    });

    const schema = parseSchema({
      schemaVersion: "1.0.0",
      sections: [
        {
          id: "s1",
          title: "申请信息",
          fields: [
            { id: "name", type: "text", label: "姓名", required: true },
            { id: "remark", type: "textarea", label: "备注", required: false },
            { id: "qty", type: "number", label: "数量", required: false },
            {
              id: "type",
              type: "radio",
              label: "类型",
              required: false,
              options: [
                { label: "个人", value: "personal" },
                { label: "公司", value: "company" },
              ],
            },
            { id: "date", type: "date", label: "日期", required: false },
            { id: "note", type: "info-text", label: "note", text: "请如实填写", required: false },
            {
              id: "items",
              type: "subform",
              label: "明细",
              required: false,
              subSchema: {
                fields: [{ id: "desc", type: "text", label: "描述", required: false }],
              },
            },
          ],
        },
      ],
    });

    const { container } = render(<Form schema={schema} />);

    // The responsive root is present and every visible control rendered.
    expect(container.querySelector(".form-engine")).toBeInTheDocument();
    expect(screen.getByLabelText(/姓名/)).toBeInTheDocument();
    expect(screen.getByLabelText(/备注/)).toBeInTheDocument();
    expect(screen.getByLabelText(/数量/)).toBeInTheDocument();
    expect(screen.getByLabelText(/日期/)).toBeInTheDocument();
    expect(screen.getByText("请如实填写")).toBeInTheDocument();

    // No inline style hard-codes a width wider than the 375px viewport.
    container.querySelectorAll("[style]").forEach((el) => {
      const width = (el as HTMLElement).style.width;
      if (width && width.endsWith("px")) {
        expect(parseFloat(width)).toBeLessThanOrEqual(375);
      }
    });
  });
});
