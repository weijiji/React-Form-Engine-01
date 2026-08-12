import { describe, expect, it } from "vitest";
import { parseSchema } from "../src/schemaParser";
import {
  buildDependencyGraph,
  computeVisibility,
  recalculateVisibility,
} from "../src/visibilityEngine";

function schema() {
  return parseSchema({
    schemaVersion: "1.0.0",
    sections: [
      {
        id: "sec-base",
        title: "基础",
        fields: [
          { id: "deviceType", type: "select", label: "设备类型", required: false },
          { id: "serial", type: "text", label: "序列号", required: false },
        ],
      },
      {
        id: "sec-secret",
        title: "涉密",
        visibilityCondition: { fieldId: "isClassified", operator: "equals", value: true },
        fields: [
          { id: "secretLevel", type: "select", label: "密级", required: false },
        ],
      },
      {
        id: "sec-main",
        title: "主",
        fields: [
          {
            id: "rows",
            type: "subform",
            label: "明细",
            required: false,
            visibilityCondition: { fieldId: "deviceType", operator: "equals", value: "rd" },
            subSchema: {
              fields: [
                { id: "name", type: "text", label: "名称", required: false },
                {
                  id: "remark",
                  type: "text",
                  label: "备注",
                  required: false,
                  visibilityCondition: { fieldId: "deviceType", operator: "equals", value: "rd" },
                },
              ],
            },
          },
        ],
      },
    ],
  });
}

describe("VisibilityEngine", () => {
  it("computes visibility for sections and fields", () => {
    const vis = computeVisibility(schema(), {
      isClassified: true,
      deviceType: "rd",
    });
    expect(vis["sec-secret"]).toBe(true);
    expect(vis["secretLevel"]).toBe(true);
    expect(vis["rows"]).toBe(true);
    expect(vis["rows.name"]).toBe(true);
    expect(vis["rows.remark"]).toBe(true);
  });

  it("hides a section and all its fields when the section condition fails", () => {
    const vis = computeVisibility(schema(), { isClassified: false, deviceType: "office" });
    expect(vis["sec-secret"]).toBe(false);
    expect(vis["secretLevel"]).toBe(false);
  });

  it("hides subform child fields when the parent subform is hidden", () => {
    const vis = computeVisibility(schema(), { deviceType: "office" });
    expect(vis["rows"]).toBe(false);
    expect(vis["rows.name"]).toBe(false);
    expect(vis["rows.remark"]).toBe(false);
  });

  it("builds a dependency graph mapping referenced fields to dependent nodes", () => {
    const graph = buildDependencyGraph(schema());
    expect(graph.dependents.get("deviceType")?.has("rows")).toBe(true);
    expect(graph.dependents.get("deviceType")?.has("rows.remark")).toBe(true);
    expect(graph.dependents.get("isClassified")?.has("sec-secret")).toBe(true);
  });

  describe("recalculateVisibility", () => {
    it("produces the same result as a full computation", () => {
      const previous = computeVisibility(schema(), { deviceType: "office", isClassified: true });
      const values = { deviceType: "rd", isClassified: true };
      const { visibility } = recalculateVisibility(schema(), values, "deviceType", previous);
      expect(visibility).toEqual(computeVisibility(schema(), values));
    });

    it("only reports the affected dependency chain", () => {
      const previous = computeVisibility(schema(), { deviceType: "office", isClassified: false });
      const values = { deviceType: "rd", isClassified: false };
      const { affected } = recalculateVisibility(schema(), values, "deviceType", previous);

      // deviceType → rows (and its descendants rows.name / rows.remark)
      expect(affected).toContain("rows");
      expect(affected).toContain("rows.remark");
      // isClassified is unaffected by deviceType changes
      expect(affected).not.toContain("sec-secret");
      expect(affected).not.toContain("secretLevel");
    });

    it("cascades hiding to descendants when a parent becomes invisible", () => {
      const previous = computeVisibility(schema(), { deviceType: "rd", isClassified: false });
      const values = { deviceType: "office", isClassified: false };
      const { visibility, affected } = recalculateVisibility(schema(), values, "deviceType", previous);
      expect(visibility["rows"]).toBe(false);
      expect(visibility["rows.name"]).toBe(false);
      expect(visibility["rows.remark"]).toBe(false);
      expect(affected).toContain("rows.name");
      expect(affected).toContain("rows.remark");
    });
  });
});
