import { describe, expect, it } from "vitest";
import {
  PORTALS,
  canAccessAny,
  portalsForPermissions,
  primaryPortal,
} from "../src/portalAccess";

// The five seed roles' permission-code sets (server/src/db/seeds/001_seed_data.ts).
const ALL_CODES = [
  "template:create", "template:edit", "template:delete", "template:publish",
  "template:export", "template:import", "template:force_unlock",
  "form:fill", "form:submit", "form:withdraw",
  "approval:view_pending", "approval:approve", "approval:reject",
  "approval:return", "approval:transfer",
  "data:view", "data:export", "data:view_stats",
  "admin:manage_roles", "admin:manage_users",
];
const DESIGNER_CODES = [
  "template:create", "template:edit", "template:delete", "template:publish",
  "template:export", "template:import", "template:force_unlock",
];
const FILLER_CODES = ["form:fill", "form:submit", "form:withdraw"];
const APPROVER_CODES = [
  "approval:view_pending", "approval:approve", "approval:reject",
  "approval:return", "approval:transfer",
];
const OPS_CODES = ["template:import", "template:export", "data:view", "data:view_stats"];

const paths = (portals: { path: string }[]): string[] => portals.map((p) => p.path);

describe("PORTALS — the five-portal catalog", () => {
  it("defines five portals in landing-priority order", () => {
    expect(PORTALS.map((p) => p.path)).toEqual([
      "/admin", "/designer", "/filler", "/approver", "/ops",
    ]);
    expect(PORTALS.map((p) => p.label)).toEqual([
      "管理员", "设计者", "填写者", "审批者", "运维",
    ]);
  });

  it("curates the unlock sets so ops cannot leak into the designer portal", () => {
    const designerCodes = PORTALS.find((p) => p.path === "/designer")!.codes;
    // 运维 holds template:import/export — these must NOT unlock the designer portal.
    expect(designerCodes).not.toContain("template:import");
    expect(designerCodes).not.toContain("template:export");
  });
});

describe("portalsForPermissions — seed roles unlock exactly their own portal", () => {
  it("管理员 (all codes) unlocks all five portals", () => {
    expect(paths(portalsForPermissions(ALL_CODES))).toEqual([
      "/admin", "/designer", "/filler", "/approver", "/ops",
    ]);
  });

  it("设计者 unlocks only the designer portal", () => {
    expect(paths(portalsForPermissions(DESIGNER_CODES))).toEqual(["/designer"]);
  });

  it("填写者 unlocks only the filler portal", () => {
    expect(paths(portalsForPermissions(FILLER_CODES))).toEqual(["/filler"]);
  });

  it("审批者 unlocks only the approver portal", () => {
    expect(paths(portalsForPermissions(APPROVER_CODES))).toEqual(["/approver"]);
  });

  it("运维 unlocks only the ops portal despite holding template:import/export", () => {
    expect(paths(portalsForPermissions(OPS_CODES))).toEqual(["/ops"]);
  });

  it("empty or unknown permissions unlock nothing", () => {
    expect(portalsForPermissions([])).toEqual([]);
    expect(portalsForPermissions(["template:view", "form:review"])).toEqual([]);
  });

  it("a single unlock code is enough (OR semantics)", () => {
    expect(paths(portalsForPermissions(["template:create"]))).toEqual(["/designer"]);
    expect(paths(portalsForPermissions(["data:view"]))).toEqual(["/ops"]);
  });
});

describe("primaryPortal — deterministic landing priority", () => {
  it("lands on the highest-priority unlocked portal", () => {
    expect(primaryPortal(ALL_CODES)).toBe("/admin");
    expect(primaryPortal(["form:fill", "approval:view_pending"])).toBe("/filler");
    expect(primaryPortal(["approval:view_pending", "data:view"])).toBe("/approver");
  });

  it("falls back to /filler when nothing is unlocked", () => {
    expect(primaryPortal([])).toBe("/filler");
    expect(primaryPortal(["template:view"])).toBe("/filler");
  });
});

describe("canAccessAny — OR membership", () => {
  it("returns true when any required code is held", () => {
    expect(canAccessAny(["template:create", "form:fill"], ["form:fill"])).toBe(true);
  });

  it("returns false when no required code is held", () => {
    expect(canAccessAny(["template:create"], ["template:view"])).toBe(false);
    expect(canAccessAny(["template:create"], [])).toBe(false);
  });
});
