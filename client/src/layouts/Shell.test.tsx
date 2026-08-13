import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Shell, type NavGroup, type ShellUser } from "./Shell";

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

function renderShell(initialEntry = "/admin/templates") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          element={
            <Shell
              brandName="动态表单引擎"
              brandSub="模板设计者门户"
              navGroups={navGroups}
              topbarTitle="设计器"
              user={user}
            />
          }
        >
          <Route
            path="/admin/templates"
            element={<div>templates content</div>}
          />
          <Route path="/admin/roles" element={<div>roles content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("Shell — shared portal chrome", () => {
  it("renders brand, nav label, topbar title, user chip and bell", () => {
    renderShell();

    expect(screen.getByText("动态表单引擎")).toBeInTheDocument();
    expect(screen.getByText("模板设计者门户")).toBeInTheDocument();
    expect(screen.getByText("设计工作台")).toBeInTheDocument();
    expect(screen.getByText("设计器")).toBeInTheDocument();
    expect(screen.getByText("张三")).toBeInTheDocument();
    expect(screen.getByText("设计者")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "通知" })).toBeInTheDocument();
  });

  it("marks the nav item for the active route and shows its count", () => {
    renderShell();

    expect(screen.getByText("模板管理").closest("a")).toHaveClass("active");
    expect(screen.getByText("角色管理").closest("a")).not.toHaveClass("active");
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("renders the matched route through the outlet", () => {
    renderShell();
    expect(screen.getByText("templates content")).toBeInTheDocument();
  });

  it("switches the active nav item when the route changes", () => {
    renderShell("/admin/roles");

    expect(screen.getByText("角色管理").closest("a")).toHaveClass("active");
    expect(screen.getByText("模板管理").closest("a")).not.toHaveClass("active");
    expect(screen.getByText("roles content")).toBeInTheDocument();
  });

  it("renders nav icons and count badges, tinting danger counts", () => {
    const { container } = renderShell();

    const template = screen.getByText("模板管理").closest("a")!;
    expect(template.querySelector("svg")).toBeInTheDocument();
    expect(template.querySelector(".count")).toHaveTextContent("7");
    expect(template.querySelector(".count")).not.toHaveClass("danger");

    const danger = container.querySelector(".count.danger");
    expect(danger).toHaveTextContent("2");
  });
});
