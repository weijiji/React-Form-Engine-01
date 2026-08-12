import React from "react";
import { Link } from "react-router-dom";

export const HomePage: React.FC = () => {
  return (
    <div>
      <section style={{ textAlign: "center", padding: "60px 20px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
          动态表单引擎
        </h1>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 16, marginBottom: 32 }}>
          配置驱动的表单构建与审批工作流系统
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          <Link
            to="/forms"
            style={{
              display: "inline-block",
              padding: "10px 24px",
              background: "var(--color-primary)",
              color: "#fff",
              borderRadius: 6,
              fontWeight: 500,
            }}
          >
            开始填写表单
          </Link>
          <Link
            to="/admin"
            style={{
              display: "inline-block",
              padding: "10px 24px",
              background: "#fff",
              color: "var(--color-primary)",
              borderRadius: 6,
              border: "1px solid var(--color-primary)",
              fontWeight: 500,
            }}
          >
            进入设计器
          </Link>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 20,
          marginTop: 40,
        }}
      >
        {[
          {
            title: "表单设计器",
            desc: "拖拽式可视化编排，配置字段、验证规则、联动条件和审批链",
            to: "/admin/templates",
          },
          {
            title: "表单填写",
            desc: "统一填写界面，实时验证反馈，草稿自动保存",
            to: "/forms",
          },
          {
            title: "审批流程",
            desc: "多级审批链，支持同意/拒绝/退回/转交，SSE 实时推送",
            to: "/approvals",
          },
        ].map((card) => (
          <Link
            key={card.title}
            to={card.to}
            style={{
              display: "block",
              padding: 24,
              background: "#fff",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              transition: "box-shadow 0.2s",
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              {card.title}
            </h3>
            <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>
              {card.desc}
            </p>
          </Link>
        ))}
      </section>
    </div>
  );
};
