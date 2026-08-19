import { describe, expect, it } from "vitest";
import { resolveStatus } from "./statusModel";

type TemplateInput = Parameters<typeof resolveStatus>[0];

const published: TemplateInput = { status: "published", locked_by: null };
const draft: TemplateInput = { status: "draft", locked_by: null };
const archived: TemplateInput = { status: "archived", locked_by: null };
const lockedByOther: TemplateInput = {
  status: "draft",
  locked_by: "user-2",
  locked_by_name: "李四",
};

describe("resolveStatus", () => {
  it("holder wins over every other state", () => {
    expect(resolveStatus(lockedByOther, true)).toEqual({
      text: "已签出 · 正在编辑",
      kind: "holder",
    });
  });

  it("maps a lock held by another user to a warning tone", () => {
    expect(resolveStatus(lockedByOther, false)).toEqual({
      text: "已锁定 · 李四",
      kind: "locked",
    });
  });

  it("falls back to 他人 when the lock holder has no display name", () => {
    expect(resolveStatus({ status: "draft", locked_by: "user-2" }, false)).toEqual({
      text: "已锁定 · 他人",
      kind: "locked",
    });
  });

  it("maps a published template to the success tone", () => {
    expect(resolveStatus(published, false)).toEqual({
      text: "已发布",
      kind: "published",
    });
  });

  it("maps an archived template to the neutral tone", () => {
    expect(resolveStatus(archived, false)).toEqual({
      text: "已归档 · 只读",
      kind: "archived",
    });
  });

  it("maps an unchecked-out draft to the neutral tone", () => {
    expect(resolveStatus(draft, false)).toEqual({
      text: "未签出",
      kind: "draft",
    });
  });

  it("handles a null template as an unchecked-out draft", () => {
    expect(resolveStatus(null, false)).toEqual({
      text: "未签出",
      kind: "draft",
    });
  });
});
