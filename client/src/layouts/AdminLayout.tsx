import React from "react";
import { Outlet, NavLink } from "react-router-dom";

const sidebarNavItems = [
  { to: "/admin/templates", label: "模板管理" },
  { to: "/admin/roles", label: "角色管理" },
];

export const AdminLayout: React.FC = () => {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: "var(--sidebar-width)",
          background: "#001529",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
        }}
      >
        <div
          style={{
            height: "var(--header-height)",
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            fontSize: 16,
            fontWeight: 700,
            borderBottom: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          表单设计器
        </div>
        <nav style={{ flex: 1, padding: "8px 0" }}>
          {sidebarNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                display: "block",
                padding: "10px 20px",
                color: isActive ? "#fff" : "rgba(255,255,255,0.65)",
                background: isActive ? "var(--color-primary)" : "transparent",
                transition: "all 0.2s",
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main content area */}
      <div style={{ marginLeft: "var(--sidebar-width)", flex: 1 }}>
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
          <h2 style={{ fontSize: 16, fontWeight: 500 }}>管理后台</h2>
        </header>

        {/* Page content */}
        <main style={{ padding: 24 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};
