import React from "react";

/**
 * Placeholder for portal pages whose real implementation lands with a later
 * work order (issue 16 wires the five-portal skeleton; the filler/approver/
 * admin/ops detail pages are filled in by their own work orders).
 */
export const PlaceholderPage: React.FC<{ title: string }> = ({ title }) => {
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>{title}</h1>
      <p style={{ color: "var(--text-2)", marginBottom: 24 }}>
        该页面将在后续工单实现。
      </p>
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "var(--r)",
          border: "1px dashed var(--border-strong)",
          padding: 40,
          textAlign: "center",
          color: "var(--text-3)",
        }}
      >
        占位页面 — 对应门户路由已就绪
      </div>
    </div>
  );
};
