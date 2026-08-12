import React from "react";
import { Outlet, NavLink } from "react-router-dom";

const navItems = [
  { to: "/forms", label: "表单中心" },
  { to: "/drafts", label: "草稿箱" },
  { to: "/submissions", label: "我的提交" },
  { to: "/approvals", label: "待审批" },
  { to: "/notifications", label: "通知" },
];

export const UserLayout: React.FC = () => {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header
        style={{
          height: "var(--header-height)",
          background: "#fff",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <NavLink
          to="/"
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "var(--color-text)",
            marginRight: 32,
          }}
        >
          动态表单引擎
        </NavLink>
        <nav style={{ display: "flex", gap: 4 }}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                padding: "6px 16px",
                borderRadius: 4,
                color: isActive ? "var(--color-primary)" : "var(--color-text-secondary)",
                background: isActive ? "rgba(22, 119, 255, 0.08)" : "transparent",
                transition: "all 0.2s",
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Page content */}
      <main style={{ flex: 1, padding: 24, maxWidth: 1200, width: "100%", margin: "0 auto" }}>
        <Outlet />
      </main>
    </div>
  );
};
