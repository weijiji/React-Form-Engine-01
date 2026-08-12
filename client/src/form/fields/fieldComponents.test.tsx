import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { parseNumberInput } from "../coerce";
import { field, fieldProps } from "../testUtils";
import { CheckboxGroup } from "./CheckboxGroup";
import { DatePicker } from "./DatePicker";
import { DateTimePicker } from "./DateTimePicker";
import { InfoText } from "./InfoText";
import { NumberInput } from "./NumberInput";
import { RadioGroup } from "./RadioGroup";
import { Section, SectionField } from "./Section";
import { Select } from "./Select";
import { TextArea } from "./TextArea";
import { TextInput } from "./TextInput";

describe("leaf field components", () => {
  it("TextInput renders a text input and emits string values", () => {
    const onChange = vi.fn();
    render(<TextInput {...fieldProps(field(), { onChange })} />);
    const input = screen.getByLabelText("字段");
    expect(input).toHaveAttribute("type", "text");

    fireEvent.change(input, { target: { value: "hello" } });
    expect(onChange).toHaveBeenCalledWith("hello");
  });

  it("TextArea renders a textarea", () => {
    render(<TextArea {...fieldProps(field({ type: "textarea" }))} />);
    expect(screen.getByLabelText("字段").tagName).toBe("TEXTAREA");
  });

  it("NumberInput emits numbers and undefined for empty", () => {
    const onChange = vi.fn();
    render(<NumberInput {...fieldProps(field({ type: "number" }), { onChange })} />);
    const input = screen.getByLabelText("字段");
    expect(input).toHaveAttribute("type", "number");

    fireEvent.change(input, { target: { value: "42" } });
    expect(onChange).toHaveBeenLastCalledWith(42);

    // jsdom's <input type="number"> won't emit a change event for an empty
    // string, so the empty→undefined mapping is covered here at the unit level.
    expect(parseNumberInput("")).toBeUndefined();
    expect(parseNumberInput("0")).toBe(0);
  });

  it("Select renders options and emits the chosen value", () => {
    const onChange = vi.fn();
    const schema = field({
      type: "select",
      options: [
        { label: "研发", value: "rd" },
        { label: "办公", value: "office" },
      ],
    });
    render(<Select {...fieldProps(schema, { onChange })} />);
    const select = screen.getByLabelText("字段");
    expect(screen.getByRole("option", { name: "研发" })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "rd" } });
    expect(onChange).toHaveBeenCalledWith("rd");
  });

  it("RadioGroup renders options and emits on select", () => {
    const onChange = vi.fn();
    const schema = field({
      type: "radio",
      options: [
        { label: "是", value: "yes" },
        { label: "否", value: "no" },
      ],
    });
    render(<RadioGroup {...fieldProps(schema, { onChange })} />);
    const group = screen.getByRole("radiogroup", { name: "字段" });

    fireEvent.click(screen.getByLabelText("是"));
    expect(group).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith("yes");
  });

  it("CheckboxGroup toggles values into an array", () => {
    const onChange = vi.fn();
    const schema = field({
      type: "checkbox",
      options: [
        { label: "A", value: "a" },
        { label: "B", value: "b" },
      ],
    });
    render(<CheckboxGroup {...fieldProps(schema, { value: ["a"], onChange })} />);

    fireEvent.click(screen.getByLabelText("B"));
    expect(onChange).toHaveBeenCalledWith(["a", "b"]);

    // Value is controlled and still ["a"]; clicking "A" removes it.
    fireEvent.click(screen.getByLabelText("A"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("DatePicker renders a date input", () => {
    render(<DatePicker {...fieldProps(field({ type: "date" }))} />);
    expect(screen.getByLabelText("字段")).toHaveAttribute("type", "date");
  });

  it("DateTimePicker renders a datetime-local input", () => {
    render(<DateTimePicker {...fieldProps(field({ type: "datetime" }))} />);
    expect(screen.getByLabelText("字段")).toHaveAttribute("type", "datetime-local");
  });

  it("InfoText renders the styled static text", () => {
    render(
      <InfoText
        {...fieldProps(field({ type: "info-text", text: "请注意", styleType: "warning" }))}
      />,
    );
    expect(screen.getByText("请注意")).toBeInTheDocument();
    expect(screen.getByText("请注意")).toHaveClass("form-info--warning");
  });

  it("Section renders a collapsible container with children", () => {
    render(
      <Section
        section={{ id: "s1", title: "基本信息", collapsible: true, fields: [] }}
      >
        <span>内容</span>
      </Section>,
    );
    expect(screen.getByText("基本信息")).toBeInTheDocument();
    expect(screen.getByText("内容")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "折叠" }));
    expect(screen.queryByText("内容")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开" })).toBeInTheDocument();
  });

  it("SectionField renders a section heading field", () => {
    render(<SectionField {...fieldProps(field({ type: "section", label: "子章节" }))} />);
    expect(screen.getByText("子章节")).toBeInTheDocument();
  });
});
