import { describe, expect, it } from "vitest";
import { parseSchema } from "../src/schemaParser";
import type { FieldSchema, ParsedSchema } from "../src/types";
import { validateAll, validateField } from "../src/validationEngine";

function field(overrides: Partial<FieldSchema> = {}): FieldSchema {
  return { id: "f", type: "text", label: "字段", required: false, ...overrides };
}

describe("validateField", () => {
  it("flags a required field that is empty", () => {
    const errors = validateField(field({ required: true }), "");
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe("required");
  });

  it("treats null, undefined, '' and [] as empty for required", () => {
    for (const v of [null, undefined, "", []]) {
      expect(validateField(field({ required: true }), v)).toHaveLength(1);
    }
    expect(validateField(field({ required: true }), 0)).toHaveLength(0);
    expect(validateField(field({ required: true }), false)).toHaveLength(0);
  });

  it("enforces minLength / maxLength", () => {
    const f = field({
      validation: {
        rules: [
          { type: "minLength", value: 3 },
          { type: "maxLength", value: 5 },
        ],
      },
    });
    expect(validateField(f, "ab")).toEqual([expect.objectContaining({ rule: "minLength" })]);
    expect(validateField(f, "abcdef")).toEqual([expect.objectContaining({ rule: "maxLength" })]);
    expect(validateField(f, "abcd")).toHaveLength(0);
  });

  it("enforces min / max on numbers", () => {
    const f = field({
      type: "number",
      validation: { rules: [{ type: "min", value: 1 }, { type: "max", value: 10 }] },
    });
    expect(validateField(f, 0)).toEqual([expect.objectContaining({ rule: "min" })]);
    expect(validateField(f, 11)).toEqual([expect.objectContaining({ rule: "max" })]);
    expect(validateField(f, 5)).toHaveLength(0);
  });

  it("enforces a regex pattern", () => {
    const f = field({ validation: { rules: [{ type: "regex", value: "^\\d{4}$" }] } });
    expect(validateField(f, "12ab")).toEqual([expect.objectContaining({ rule: "regex" })]);
    expect(validateField(f, "1234")).toHaveLength(0);
  });

  it("does not crash on an invalid regex pattern", () => {
    const f = field({ validation: { rules: [{ type: "regex", value: "(" }] } });
    expect(validateField(f, "anything")).toHaveLength(0);
  });

  it("skips value rules when the value is empty and not required", () => {
    const f = field({ validation: { rules: [{ type: "minLength", value: 3 }] } });
    expect(validateField(f, "")).toHaveLength(0);
  });

  it("supports a custom message", () => {
    const f = field({ required: true, validation: { rules: [{ type: "minLength", value: 5, message: "太短了" }] } });
    expect(validateField(f, "ab")[0].message).toBe("太短了");
  });

  describe("file validation", () => {
    it("enforces maxCount, maxSizeMB and allowTypes", () => {
      const f = field({ type: "file", maxCount: 1, maxSizeMB: 1, allowTypes: ["pdf"] });
      const big = [{ name: "a.pdf", type: "application/pdf", size: 2 * 1024 * 1024 }];
      expect(validateField(f, big).map((e) => e.rule)).toContain("fileSize");

      const two = [
        { name: "a.pdf", type: "application/pdf", size: 10 },
        { name: "b.pdf", type: "application/pdf", size: 10 },
      ];
      expect(validateField(f, two).map((e) => e.rule)).toContain("fileCount");

      const wrongType = [{ name: "a.exe", type: "application/octet-stream", size: 10 }];
      expect(validateField(f, wrongType).map((e) => e.rule)).toContain("fileType");

      const ok = [{ name: "a.pdf", type: "application/pdf", size: 10 }];
      expect(validateField(f, ok)).toHaveLength(0);
    });

    it("matches an allow-list entry by extension when type is absent", () => {
      const f = field({ type: "file", allowTypes: [".pdf"] });
      expect(validateField(f, [{ name: "a.pdf", size: 10 }])).toHaveLength(0);
    });
  });
});

describe("validateAll", () => {
  function dateRangeSchema(): ParsedSchema {
    return parseSchema({
      schemaVersion: "1.0.0",
      sections: [
        {
          id: "s",
          title: "日期",
          fields: [
            { id: "start", type: "date", label: "开始", required: true },
            {
              id: "end",
              type: "date",
              label: "结束",
              required: false,
              validation: {
                rules: [
                  { type: "crossField", fieldId: "start", operator: "greaterThan", message: "结束日期必须晚于开始日期" },
                ],
              },
            },
          ],
        },
      ],
    });
  }

  it("evaluates a cross-field rule (end > start)", () => {
    const schema = dateRangeSchema();
    expect(validateAll(schema, { start: "2026-01-01", end: "2026-01-02" })).toEqual({});
    const errors = validateAll(schema, { start: "2026-01-02", end: "2026-01-01" });
    expect(errors.end).toEqual([expect.objectContaining({ rule: "crossField", message: "结束日期必须晚于开始日期" })]);
  });

  it("supports non-comparison operators in cross-field rules (equals)", () => {
    const schema = parseSchema({
      schemaVersion: "1.0.0",
      sections: [
        {
          id: "s",
          title: "x",
          fields: [
            { id: "a", type: "text", label: "a", required: false },
            {
              id: "b",
              type: "text",
              label: "b",
              required: false,
              validation: {
                rules: [{ type: "crossField", fieldId: "a", operator: "equals", message: "b 必须等于 a" }],
              },
            },
          ],
        },
      ],
    });
    expect(validateAll(schema, { a: "x", b: "x" })).toEqual({});
    expect(validateAll(schema, { a: "x", b: "y" }).b).toEqual([
      expect.objectContaining({ rule: "crossField", message: "b 必须等于 a" }),
    ]);
  });

  it("recursively validates subform rows with dotted-path keys", () => {
    const schema = parseSchema({
      schemaVersion: "1.0.0",
      sections: [
        {
          id: "s",
          title: "x",
          fields: [
            {
              id: "items",
              type: "subform",
              label: "明细",
              required: true,
              subSchema: {
                fields: [
                  { id: "name", type: "text", label: "名称", required: true },
                  { id: "qty", type: "number", label: "数量", required: false, validation: { rules: [{ type: "min", value: 1 }] } },
                ],
              },
            },
          ],
        },
      ],
    });

    const errors = validateAll(schema, {
      items: [
        { name: "", qty: 0 },
        { name: "ok", qty: 2 },
      ],
    });
    expect(errors["items.0.name"]).toEqual([expect.objectContaining({ rule: "required" })]);
    expect(errors["items.0.qty"]).toEqual([expect.objectContaining({ rule: "min" })]);
    expect(errors["items.1.name"]).toBeUndefined();
    expect(errors["items.1.qty"]).toBeUndefined();
  });

  it("flags an empty required subform", () => {
    const schema = parseSchema({
      schemaVersion: "1.0.0",
      sections: [{ id: "s", title: "x", fields: [{ id: "items", type: "subform", label: "明细", required: true, subSchema: { fields: [] } }] }],
    });
    expect(validateAll(schema, { items: [] }).items).toEqual([expect.objectContaining({ rule: "required" })]);
  });

  it("validates nested subforms (2 levels)", () => {
    const schema = parseSchema({
      schemaVersion: "1.0.0",
      sections: [
        {
          id: "s",
          title: "x",
          fields: [
            {
              id: "orders",
              type: "subform",
              label: "订单",
              required: false,
              subSchema: {
                fields: [
                  {
                    id: "lines",
                    type: "subform",
                    label: "行",
                    required: false,
                    subSchema: { fields: [{ id: "sku", type: "text", label: "SKU", required: true }] },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const errors = validateAll(schema, {
      orders: [{ lines: [{ sku: "" }] }],
    });
    expect(errors["orders.0.lines.0.sku"]).toEqual([expect.objectContaining({ rule: "required" })]);
  });
});
