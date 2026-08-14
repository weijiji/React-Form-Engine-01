import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Shell,
  filterNavGroups,
  type NavGroup,
  type ShellUser,
} from "./Shell";

// react-router's data router (createMemoryRouter) builds a `Request` for every
// navigation. jsdom's AbortController yields an AbortSignal that Node's native
// undici `Request` rejects (cross-realm instanceof). Our routes carry no
// loaders, so the router only needs the request's url/signal — swap in a
// minimal stub that skips undici's signal validation.
class TestRequest {
  readonly url: string;
  readonly method = "GET";
  readonly signal: AbortSignal | null;
  readonly redirect = "follow";
  readonly headers = {
    set() {},
    has() {
      return false;
    },
    get() {
      return null;
    },
  };

  constructor(input: string, init?: { signal?: AbortSignal | null }) {
    this.url = input;
    this.signal = init?.signal ?? null;
  }

  clone() {
    return this;
  }
  text() {
    return Promise.resolve("");
  }
  formData() {
    return Promise.resolve(null as never);
  }
  json() {
    return Promise.resolve({});
  }
}

const navGroups: NavGroup[] = [
  {
    label: "设计工作台",
    items: [
      { to: "/admin/templates", label: "模板管理", icon: <svg />, count: 7 },
      { to: "/admin/roles", label: "角色管理", icon: <svg /> },
      {
        to: "/notifications",
        label: "通知中心",
        icon: <svg />,
        count: 2,
        countTone: "danger",
      },
    ],
  },
];

const user: ShellUser = { name: "张三", role: "设计者" };

// The topbar title/crumb now come from each route's `handle`, so drive the
// Shell through a data router (useMatches needs it) with per-route handles.
function renderShell(initialEntry = "/admin/templates") {
  const router = createMemoryRouter(
    [
      {
        element: (
          <Shell
            brandName="动态表单引擎"
            brandSub="模板设计者门户"
            navGroups={navGroups}
            user={user}
          />
        ),
        children: [
          {
            path: "/admin/templates",
            element: <div>templates content</div>,
            handle: { title: "模板管理", crumb: "模板设计者" },
          },
          {
            path: "/admin/roles",
            element: <div>roles content</div>,
            handle: { title: "角色管理", crumb: "模板设计者" },
          },
        ],
      },
    ],
    { initialEntries: [initialEntry] },
  );
  return render(<RouterProvider router={router} />);
}

// Title/crumb resolve from the route handle after the router's initial
// navigation, which is async — wait for it.
async function expectTitle(text: string) {
  await waitFor(() => {
    expect(document.querySelector(".tb-title")?.textContent).toBe(text);
  });
}

beforeEach(() => {
  vi.stubGlobal("Request", TestRequest);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Shell — shared portal chrome", () => {
  it("renders brand, nav label, route title, user chip and bell", async () => {
    renderShell();

    expect(screen.getByText("动态表单引擎")).toBeInTheDocument();
    expect(document.querySelector(".brand-sub")?.textContent).toBe(
      "模板设计者门户",
    );
    expect(screen.getByText("设计工作台")).toBeInTheDocument();
    await expectTitle("模板管理");
    expect(document.querySelector(".tb-crumb")?.textContent).toBe("模板设计者");
    expect(screen.getByText("张三")).toBeInTheDocument();
    expect(screen.getByText("设计者")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "通知" })).toBeInTheDocument();
  });

  it("marks the nav item for the active route and shows its count", () => {
    renderShell();

    expect(screen.getByRole("link", { name: /模板管理/ })).toHaveClass("active");
    expect(screen.getByRole("link", { name: /角色管理/ })).not.toHaveClass("active");
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("renders the matched route through the outlet", () => {
    renderShell();
    expect(screen.getByText("templates content")).toBeInTheDocument();
  });

  it("switches the active nav item and topbar title when the route changes", async () => {
    renderShell("/admin/roles");

    expect(screen.getByRole("link", { name: /角色管理/ })).toHaveClass("active");
    expect(screen.getByRole("link", { name: /模板管理/ })).not.toHaveClass("active");
    expect(screen.getByText("roles content")).toBeInTheDocument();
    await expectTitle("角色管理");
  });

  it("renders nav icons and count badges, tinting danger counts", () => {
    const { container } = renderShell();

    const template = screen.getByRole("link", { name: /模板管理/ });
    expect(template.querySelector("svg")).toBeInTheDocument();
    expect(template.querySelector(".count")).toHaveTextContent("7");
    expect(template.querySelector(".count")).not.toHaveClass("danger");

    const danger = container.querySelector(".count.danger");
    expect(danger).toHaveTextContent("2");
  });
});

describe("filterNavGroups — permission-based nav filtering (work order 18)", () => {
  const groups: NavGroup[] = [
    {
      label: "设计工作台",
      items: [
        { to: "/designer/create", label: "创建表单", codes: ["template:create"] },
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
