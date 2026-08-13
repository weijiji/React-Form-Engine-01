import { describe, expect, it } from "vitest";
import type { FieldSchema, SectionSchema } from "form-engine-core";
import {
  addField,
  addSection,
  createEmptySchema,
  createField,
  ensureSection,
  findField,
  moveField,
  reorderField,
  removeField,
  removeRule,
  setRule,
  updateField,
  updateSection,
} from "./schemaModel";

function textField(id: string): FieldSchema {
  return { id, type: "text", label: `字段 ${id}`, required: false };
}

function section(id: string, fields: FieldSchema[] = []): SectionSchema {
  return { id, title: `章节 ${id}`, fields };
}

describe("createEmptySchema / ensureSection", () => {
  it("starts with no sections and schemaVersion 1.0.0", () => {
    const schema = createEmptySchema();
    expect(schema.schemaVersion).toBe("1.0.0");
    expect(schema.sections).toEqual([]);
  });

  it("ensureSection adds a default section when empty", () => {
    const schema = ensureSection(createEmptySchema());
    expect(schema.sections).toHaveLength(1);
    expect(schema.sections[0].fields).toEqual([]);
  });

  it("ensureSection is a no-op when a section already exists", () => {
    const schema = ensureSection({ schemaVersion: "1.0.0", sections: [section("s1")] });
    expect(schema.sections).toHaveLength(1);
    expect(schema.sections[0].id).toBe("s1");
  });
});

describe("createField", () => {
  it("assigns type-specific defaults", () => {
    expect(createField("select").options?.length).toBe(2);
    expect(createField("radio").options?.length).toBe(2);
    expect(createField("checkbox").options?.length).toBe(2);
    expect(createField("subform").subSchema).toEqual({ fields: [] });
    expect(createField("info-text").styleType).toBe("info");
    expect(createField("text").options).toBeUndefined();
  });

  it("generates a unique id prefixed with fld", () => {
    expect(createField("text").id.startsWith("fld-")).toBe(true);
    expect(createField("text").id).not.toBe(createField("text").id);
  });
});

describe("field CRUD within a section", () => {
  it("addField appends to the target section", () => {
    const schema = addField(
      { schemaVersion: "1.0.0", sections: [section("s1")] },
      "s1",
      textField("f1"),
    );
    expect(schema.sections[0].fields.map((f) => f.id)).toEqual(["f1"]);
  });

  it("addField does not touch other sections", () => {
    const schema = {
      schemaVersion: "1.0.0",
      sections: [section("s1"), section("s2")],
    };
    const next = addField(schema, "s1", textField("f1"));
    expect(next.sections[1].fields).toEqual([]);
  });

  it("updateField merges a patch onto the matching field", () => {
    const schema = {
      schemaVersion: "1.0.0",
      sections: [section("s1", [textField("f1")])],
    };
    const next = updateField(schema, "s1", "f1", { label: "改名", required: true });
    expect(next.sections[0].fields[0].label).toBe("改名");
    expect(next.sections[0].fields[0].required).toBe(true);
    expect(next.sections[0].fields[0].type).toBe("text");
  });

  it("removeField removes only the matching field", () => {
    const schema = {
      schemaVersion: "1.0.0",
      sections: [section("s1", [textField("f1"), textField("f2")])],
    };
    const next = removeField(schema, "s1", "f1");
    expect(next.sections[0].fields.map((f) => f.id)).toEqual(["f2"]);
  });

  it("updateSection patches section metadata", () => {
    const schema = { schemaVersion: "1.0.0", sections: [section("s1")] };
    const next = updateSection(schema, "s1", { title: "基本信息" });
    expect(next.sections[0].title).toBe("基本信息");
  });

  it("addSection appends a new section", () => {
    const next = addSection(
      { schemaVersion: "1.0.0", sections: [section("s1")] },
      section("s2"),
    );
    expect(next.sections.map((s) => s.id)).toEqual(["s1", "s2"]);
  });
});

describe("moveField", () => {
  const schema = () => ({
    schemaVersion: "1.0.0",
    sections: [section("s1", [textField("a"), textField("b"), textField("c")])],
  });

  it("moves a field down", () => {
    const next = moveField(schema(), "s1", "a", 1);
    expect(next.sections[0].fields.map((f) => f.id)).toEqual(["b", "a", "c"]);
  });

  it("moves a field up", () => {
    const next = moveField(schema(), "s1", "c", -1);
    expect(next.sections[0].fields.map((f) => f.id)).toEqual(["a", "c", "b"]);
  });

  it("is a no-op at the boundaries", () => {
    expect(moveField(schema(), "s1", "a", -1).sections[0].fields.map((f) => f.id)).toEqual(["a", "b", "c"]);
    expect(moveField(schema(), "s1", "c", 1).sections[0].fields.map((f) => f.id)).toEqual(["a", "b", "c"]);
  });

  it("is a no-op for an unknown field id", () => {
    expect(moveField(schema(), "s1", "missing", 1)).toEqual(schema());
  });
});

describe("reorderField", () => {
  const schema = () => ({
    schemaVersion: "1.0.0",
    sections: [section("s1", [textField("a"), textField("b"), textField("c")])],
  });

  it("moves a field to a target index", () => {
    expect(reorderField(schema(), "s1", "a", 2).sections[0].fields.map((f) => f.id)).toEqual(["b", "c", "a"]);
    expect(reorderField(schema(), "s1", "c", 0).sections[0].fields.map((f) => f.id)).toEqual(["c", "a", "b"]);
  });

  it("clamps out-of-range indices", () => {
    expect(reorderField(schema(), "s1", "a", 99).sections[0].fields.map((f) => f.id)).toEqual(["b", "c", "a"]);
    expect(reorderField(schema(), "s1", "c", -1).sections[0].fields.map((f) => f.id)).toEqual(["c", "a", "b"]);
  });
});

describe("findField", () => {
  it("locates a field and its section", () => {
    const schema = {
      schemaVersion: "1.0.0",
      sections: [section("s1", [textField("f1")])],
    };
    expect(findField(schema, "f1")).toEqual({
      sectionId: "s1",
      field: textField("f1"),
    });
  });

  it("returns null when not found", () => {
    expect(findField({ schemaVersion: "1.0.0", sections: [] }, "nope")).toBeNull();
  });
});

describe("validation rule helpers", () => {
  const field = (): FieldSchema => textField("f1");

  it("setRule adds a new rule", () => {
    const next = setRule(field(), "minLength", { value: 2, message: "至少2个字符" });
    expect(next.validation?.rules).toEqual([
      { type: "minLength", value: 2, message: "至少2个字符" },
    ]);
  });

  it("setRule upserts an existing rule", () => {
    const withRule = setRule(field(), "minLength", { value: 2 });
    const next = setRule(withRule, "minLength", { value: 5 });
    expect(next.validation?.rules).toEqual([{ type: "minLength", value: 5 }]);
  });

  it("removeRule drops the rule", () => {
    const withRule = setRule(field(), "minLength", { value: 2 });
    const next = removeRule(withRule, "minLength");
    expect(next.validation?.rules).toEqual([]);
  });
});
