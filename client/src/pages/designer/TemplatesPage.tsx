import React, { useEffect, useState } from "react";
import { apiClient } from "../../config/api";

interface HealthResponse {
  status: string;
  db: string;
  timestamp: string;
  uptime: number;
  env: string;
}

export const TemplatesPage: React.FC = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient<HealthResponse>("/health")
      .then(setHealth)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>我的模板</h1>
      <p style={{ color: "var(--text-2)", marginBottom: 24 }}>
        创建和管理表单模板。拖拽字段到画布，配置属性和审批链，发布后即可使用。
      </p>

      {/* Health check card */}
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          border: "1px solid var(--border)",
          padding: 20,
          marginBottom: 24,
        }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          系统状态
        </h3>
        {error ? (
          <p style={{ color: "var(--danger)" }}>
            无法连接后端服务: {error}
          </p>
        ) : health ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, fontSize: 13 }}>
            <div>
              <span style={{ color: "var(--text-2)" }}>状态: </span>
              <span style={{ color: health.status === "ok" ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
                {health.status === "ok" ? "正常" : "异常"}
              </span>
            </div>
            <div>
              <span style={{ color: "var(--text-2)" }}>数据库: </span>
              <span style={{ color: health.db === "connected" ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
                {health.db === "connected" ? "已连接" : "未连接"}
              </span>
            </div>
            <div>
              <span style={{ color: "var(--text-2)" }}>环境: </span>
              <span>{health.env}</span>
            </div>
            <div>
              <span style={{ color: "var(--text-2)" }}>运行时间: </span>
              <span>{Math.floor(health.uptime)}s</span>
            </div>
          </div>
        ) : (
          <p style={{ color: "var(--text-2)" }}>加载中...</p>
        )}
      </div>

      {/* Placeholder for template list */}
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          border: "1px solid var(--border)",
          padding: 40,
          textAlign: "center",
          color: "var(--text-2)",
        }}
      >
        <p style={{ fontSize: 16, marginBottom: 8 }}>暂无模板</p>
        <p style={{ fontSize: 13 }}>
          点击"新建模板"开始创建您的第一个表单模板
        </p>
      </div>
    </div>
  );
};
