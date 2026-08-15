import { describe, expect, it } from "vitest";
import {
  canAccessAny,
  filterNavGroups,
  firstAccessiblePath,
} from "./permissions";
import type { NavGroup } from "../layouts/Shell";

describe("canAccessAny — OR membership (ADR-0010)", () => {
  it("returns true when any required code is held", () => {
    expect(canAccessAny(["template:create", "form:fill"], ["form:fill"])).toBe(
      true,
    );
  });

  it("returns false when no required code is held", () => {
    expect(canAccessAny(["template:create"], ["template:view"])).toBe(false);
    expect(canAccessAny(["template:create"], [])).toBe(false);
  });
});

describe("filterNavGroups — permission-based nav filtering", () => {
  const groups: NavGroup[] = [
    {
      label: "设计工作台",
      items: [
        { to: "/designer/create", label: "创建模板", codes: ["template:create"] },
        { to: "/notifications", label: "通知中心" }, // no codes → always shown
      ],
    },
    {
      label: "运维",
      items: [{ to: "/ops/import", label: "导入配置", codes: ["template:import"] }],
    },
  ];

  it("keeps code-less items and items whose code the user holds", () => {
    const filtered = filterNavGroups(groups, ["template:import"]);
    expect(filtered.map((g) => g.label)).toEqual(["设计工作台", "运维"]);
    expect(filtered[0].items.map((i) => i.to)).toEqual(["/notifications"]);
    expect(filtered[1].items.map((i) => i.to)).toEqual(["/ops/import"]);
  });

  it("drops a whole group when every item is filtered out", () => {
    const filtered = filterNavGroups(groups, ["data:view"]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].items.map((i) => i.to)).toEqual(["/notifications"]);
  });

  it("does not mutate the input nav groups", () => {
    filterNavGroups(groups, []);
    expect(groups).toHaveLength(2);
    expect(groups[0].items).toHaveLength(2);
  });
});

describe("firstAccessiblePath — landing = first unlocked nav item", () => {
  const nav: NavGroup[] = [
    {
      label: "系统管理",
      items: [{ to: "/admin/users", label: "用户管理", codes: ["admin:manage_users"] }],
    },
    {
      label: "设计工作台",
      items: [{ to: "/designer/templates", label: "我的模板", codes: ["template:edit"] }],
    },
    {
      label: "通用",
      items: [{ to: "/notifications", label: "通知中心" }],
    },
  ];

  it("lands on the first group's first item when the user holds all codes", () => {
    expect(firstAccessiblePath(nav, ["admin:manage_users", "template:edit"])).toBe(
      "/admin/users",
    );
  });

  it("skips groups the user cannot unlock and lands on the first accessible", () => {
    expect(firstAccessiblePath(nav, ["template:edit"])).toBe("/designer/templates");
    expect(firstAccessiblePath(nav, [])).toBe("/notifications");
  });

  it("returns null when no item is accessible (empty nav)", () => {
    expect(firstAccessiblePath([], ["template:edit"])).toBeNull();
  });
});
