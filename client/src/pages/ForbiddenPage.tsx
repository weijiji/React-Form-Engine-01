import React from "react";
import { Link } from "react-router-dom";

/**
 * 403 (work order 17). Shown when an authenticated user lacks the role for the
 * portal they tried to reach. Mirrors NotFoundPage's inline treatment.
 */
export const ForbiddenPage: React.FC = () => {
  return (
    <div style={{ textAlign: "center", padding: "80px 20px" }}>
      <h1
        style={{
          fontSize: 72,
          fontWeight: 700,
          color: "var(--border)",
          marginBottom: 8,
        }}
      >
        403
      </h1>
      <p style={{ fontSize: 16, color: "var(--text-2)", marginBottom: 24 }}>
        您没有权限访问该门户
      </p>
      <Link
        to="/"
        style={{
          display: "inline-block",
          padding: "8px 20px",
          background: "var(--brand)",
          color: "#fff",
          borderRadius: 6,
        }}
      >
        返回首页
      </Link>
    </div>
  );
};
