import { describe, expect, it } from "vitest";
import { parseSchema, SchemaParseError, SUPPORTED_SCHEMA_MAJOR } from "../src/schemaParser";

function validSchema(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: `${SUPPORTED_SCHEMA_MAJOR}.0.0`,
    sections: [
      {
        id: "sec-1",
        title: "基本信息",
        fields: [
          { id: "fld-name", type: "text", label: "设备名称", required: true },
          {
            id: "fld-type",
            type: "select",
            label: "设备类型",
            required: false,
            options: [
              { label: "办公设备", value: "office" },
              { label: "研发设备", value: "rd" },
            ],
          },
          { id: "fld-info", type: "info-text", label: "提示", styleType: "info", text: "静态文本", visibilityCondition: { fieldId: "fld-type", operator: "equals", value: "rd" } },
        ],
      },
    ],
    ...overrides,
  };
}

function validApprovalChain(): Record<string, unknown> {
  return {
    nodes: [
      { id: "node-1", order: 1, label: "直属上级审批", approverRule: { type: "org_structure", relation: "direct_manager" } },
      { id: "node-2", order: 2, approverRule: { type: "role", roleId: "role-it" } },
    ],
  };
}

describe("SchemaParser", () => {
  it("parses a valid schema into a typed IR", () => {
    const parsed = parseSchema(validSchema(), validApprovalChain());
    expect(parsed.schemaVersion).toBe(`${SUPPORTED_SCHEMA_MAJOR}.0.0`);
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0].fields).toHaveLength(3);
    expect(parsed.sections[0].fields[0]).toMatchObject({ id: "fld-name", type: "text", required: true });
    expect(parsed.approvalChain?.nodes).toHaveLength(2);
    expect(parsed.approvalChain?.nodes[0].approverRule).toEqual({ type: "org_structure", relation: "direct_manager" });
  });

  it("keeps info-text static text and its visibilityCondition", () => {
    const parsed = parseSchema(validSchema());
    const info = parsed.sections[0].fields.find((f) => f.id === "fld-info");
    expect(info).toMatchObject({ type: "info-text", styleType: "info", text: "静态文本" });
    expect(info?.visibilityCondition).toEqual({ fieldId: "fld-type", operator: "equals", value: "rd" });
  });

  describe("rejections", () => {
    it("rejects a missing schemaVersion", () => {
      const schema = validSchema();
      delete schema.schemaVersion;
      assertThrows(schema, undefined, "SCHEMA_VERSION_MISSING");
    });

    it("rejects an unknown schemaVersion", () => {
      assertThrows(validSchema({ schemaVersion: "2.0.0" }), undefined, "SCHEMA_VERSION_UNKNOWN");
    });

    it("rejects a non-object schema", () => {
      expect(() => parseSchema(null)).toThrow(SchemaParseError);
      expect(() => parseSchema("nope")).toThrow(SchemaParseError);
    });

    it("rejects an unknown fieldType", () => {
      const schema = validSchema();
      (schema.sections as unknown[])[0] = {
        id: "sec-1",
        title: "x",
        fields: [{ id: "f", type: "made-up", label: "x" }],
      };
      assertThrows(schema, undefined, "FIELD_TYPE_UNKNOWN");
    });

    it("rejects a field missing its id/label", () => {
      const schema = validSchema();
      (schema.sections as unknown[])[0] = {
        id: "sec-1",
        title: "x",
        fields: [{ type: "text", label: "no id" }],
      };
      assertThrows(schema, undefined, "SCHEMA_STRUCTURE_INVALID");
    });

    it("rejects an empty approval chain", () => {
      assertThrows(validSchema(), { nodes: [] }, "APPROVAL_CHAIN_INVALID");
    });

    it("rejects an approval chain with an unknown rule type", () => {
      const chain = { nodes: [{ id: "n", order: 1, approverRule: { type: "weird" } }] };
      assertThrows(validSchema(), chain, "APPROVAL_CHAIN_INVALID");
    });

    it("rejects an approval chain with duplicate orders", () => {
      const chain = {
        nodes: [
          { id: "n1", order: 1, approverRule: { type: "specific", userId: "u1" } },
          { id: "n2", order: 1, approverRule: { type: "specific", userId: "u2" } },
        ],
      };
      assertThrows(validSchema(), chain, "APPROVAL_CHAIN_INVALID");
    });

    // BUG-13: order is the 1-based position in the chain — it flows verbatim
    // into approval_records.node_order and the execution guard compares
    // `node_order - 1` to the 0-based current_node_index. A 0-based or
    // fractional order silently breaks every approval action, so it's rejected.
    it("rejects a 0-based node order (BUG-13)", () => {
      const chain = {
        nodes: [
          { id: "n1", order: 0, approverRule: { type: "specific", userId: "u1" } },
          { id: "n2", order: 1, approverRule: { type: "specific", userId: "u2" } },
        ],
      };
      assertThrows(validSchema(), chain, "APPROVAL_CHAIN_INVALID");
    });

    it("rejects a negative node order", () => {
      const chain = { nodes: [{ id: "n", order: -1, approverRule: { type: "specific", userId: "u1" } }] };
      assertThrows(validSchema(), chain, "APPROVAL_CHAIN_INVALID");
    });

    it("rejects a fractional node order", () => {
      const chain = { nodes: [{ id: "n", order: 1.5, approverRule: { type: "specific", userId: "u1" } }] };
      assertThrows(validSchema(), chain, "APPROVAL_CHAIN_INVALID");
    });

    it("rejects an org_structure rule missing relation", () => {
      const chain = { nodes: [{ id: "n", order: 1, approverRule: { type: "org_structure" } }] };
      assertThrows(validSchema(), chain, "APPROVAL_CHAIN_INVALID");
    });
  });

  describe("subform nesting depth", () => {
    function subformField(id: string, childFields: unknown[]): Record<string, unknown> {
      return { id, type: "subform", label: "子表", required: false, subSchema: { fields: childFields } };
    }

    it("accepts 2 levels of nesting (main → subform → subform)", () => {
      const grandchild = { id: "leaf", type: "text", label: "叶" };
      const child = subformField("sub2", [grandchild]);
      const top = subformField("sub1", [child]);
      const schema = validSchema();
      (schema.sections as unknown[])[0] = {
        id: "sec-1",
        title: "x",
        fields: [top],
      };
      expect(() => parseSchema(schema)).not.toThrow();
    });

    it("rejects 3 levels of nesting", () => {
      const greatGrand = { id: "leaf", type: "text", label: "叶" };
      const grandchild = subformField("sub3", [greatGrand]);
      const child = subformField("sub2", [grandchild]);
      const top = subformField("sub1", [child]);
      const schema = validSchema();
      (schema.sections as unknown[])[0] = {
        id: "sec-1",
        title: "x",
        fields: [top],
      };
      assertThrows(schema, undefined, "SUBFORM_NESTING_TOO_DEEP");
    });
  });
});

function assertThrows(
  schema: unknown,
  approvalChain: unknown,
  code: string,
): void {
  try {
    parseSchema(schema, approvalChain);
    expect.unreachable("expected parseSchema to throw");
  } catch (e) {
    expect(e).toBeInstanceOf(SchemaParseError);
    expect((e as SchemaParseError).code).toBe(code);
  }
}
