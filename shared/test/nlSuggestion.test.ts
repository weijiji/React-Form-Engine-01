import { describe, expect, it } from "vitest";
import { parseSchema } from "../src/schemaParser";
import {
  matchRuleSuggestion,
  normalizeSuggestion,
  SuggestionError,
  suggestionFieldCount,
  translateSuggestion,
  type FormStructureSuggestion,
} from "../src/nlSuggestion";

/** A typical leave-request suggestion, the shape the LLM is asked to return. */
function leaveSuggestion(): FormStructureSuggestion {
  return {
    name: "日常请假申请单",
    description: "员工日常请假的申请表单",
    sections: [
      {
        title: "请假信息",
        fields: [
          {
            label: "请假类型",
            type: "select",
            required: true,
            options: ["年假", "事假", "病假", "调休"],
          },
          { label: "开始日期", type: "date", required: true },
          { label: "请假事由", type: "textarea", required: false },
        ],
      },
    ],
  };
}

describe("translateSuggestion — 建议 → 合法 schema（SchemaParser 兜底）", () => {
  it("翻译结果可被 SchemaParser 接受，且保留名称/章节/字段/选项", () => {
    const schema = translateSuggestion(leaveSuggestion());
    const parsed = parseSchema(schema);

    expect(schema.schemaVersion).toBe("1.0.0");
    expect(parsed.sections).toHaveLength(1);
    const section = parsed.sections[0];
    expect(section.title).toBe("请假信息");
    expect(section.fields).toHaveLength(3);

    const type = section.fields[0];
    expect(type.label).toBe("请假类型");
    expect(type.type).toBe("select");
    expect(type.required).toBe(true);
    expect(type.options?.map((o) => o.label)).toEqual(["年假", "事假", "病假", "调休"]);
  });

  it("字段/章节 id 全局唯一", () => {
    const schema = translateSuggestion(leaveSuggestion());
    const ids = schema.sections.flatMap((s) => [s.id, ...s.fields.map((f) => f.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("空 sections 也产出合法 schema（是否可用由调用方判断）", () => {
    const schema = translateSuggestion({ name: "空表单", sections: [] });
    expect(() => parseSchema(schema)).not.toThrow();
    expect(suggestionFieldCount({ name: "空表单", sections: [] })).toBe(0);
  });
});

describe("matchRuleSuggestion — 规则引擎兜底", () => {
  it("关键词命中预置示例", () => {
    expect(matchRuleSuggestion("我要一个请假申请单")?.name).toBe("日常请假申请单");
    expect(matchRuleSuggestion("办公用品采购")?.name).toBe("办公用品采购申请表");
    expect(matchRuleSuggestion("报销差旅费")?.name).toBe("差旅费用报销单");
    expect(matchRuleSuggestion("出差到上海")?.name).toBe("出差申请单");
    expect(matchRuleSuggestion("设备报备")?.name).toBe("设备报备单");
    expect(matchRuleSuggestion("员工入职登记")?.name).toBe("员工入职信息登记表");
  });

  it("未命中返回 null", () => {
    expect(matchRuleSuggestion("装逼用表单")).toBeNull();
    expect(matchRuleSuggestion("")).toBeNull();
  });

  it("返回的是独立副本，改动不影响后续调用", () => {
    const a = matchRuleSuggestion("请假")!;
    a.name = "被改坏的名字";
    const b = matchRuleSuggestion("请假")!;
    expect(b.name).toBe("日常请假申请单");
  });
});

describe("normalizeSuggestion — 防御性归一化 LLM 输出", () => {
  it("结构合法时原样归一", () => {
    const out = normalizeSuggestion(leaveSuggestion());
    expect(out.name).toBe("日常请假申请单");
    expect(out.sections[0].fields[0].type).toBe("select");
  });

  it("未知字段类型落为 text", () => {
    const raw = {
      name: "测试",
      sections: [{ title: "A", fields: [{ label: "x", type: "时间控件", required: true }] }],
    };
    expect(normalizeSuggestion(raw).sections[0].fields[0].type).toBe("text");
  });

  it("缺标签/缺章节标题给占位名，缺 required 补 false", () => {
    const raw = {
      name: "测试",
      sections: [{ fields: [{ type: "text" }] }],
    };
    const out = normalizeSuggestion(raw);
    expect(out.sections[0].title).toBe("基本信息");
    expect(out.sections[0].fields[0].label).toBe("未命名字段");
    expect(out.sections[0].fields[0].required).toBe(false);
  });

  it("非对象 / 缺 name / sections 非数组抛 SuggestionError", () => {
    expect(() => normalizeSuggestion(null)).toThrow(SuggestionError);
    expect(() => normalizeSuggestion({ sections: [] })).toThrow(SuggestionError);
    expect(() => normalizeSuggestion({ name: "x", sections: "no" })).toThrow(SuggestionError);
  });

  it("超长字符串被截断（成本/注入控制）", () => {
    const raw = {
      name: "x".repeat(200),
      sections: [{ title: "y".repeat(200), fields: [{ label: "z".repeat(200), type: "text", required: false }] }],
    };
    const out = normalizeSuggestion(raw);
    expect(out.name.length).toBeLessThanOrEqual(60);
    expect(out.sections[0].title.length).toBeLessThanOrEqual(60);
    expect(out.sections[0].fields[0].label.length).toBeLessThanOrEqual(60);
  });

  it("options 仅 select/radio/checkbox 保留且收敛为字符串数组", () => {
    const raw = {
      name: "测试",
      sections: [
        {
          title: "A",
          fields: [
            { label: "单选", type: "radio", required: false, options: ["一", "二", null, "", 3] },
            { label: "文本", type: "text", required: false, options: ["应被丢弃"] },
          ],
        },
      ],
    };
    const out = normalizeSuggestion(raw);
    expect(out.sections[0].fields[0].options).toEqual(["一", "二", "3"]);
    expect(out.sections[0].fields[1].options).toBeUndefined();
  });
});
