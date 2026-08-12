# 01 — 项目脚手架 + 数据库

**What to build:** `docker-compose up` 后，开发环境完全就绪：Node/Express 后端可启动、PostgreSQL 数据库所有表已创建、React/Vite 前端可启动并连接到后端。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Docker Compose 编排：Node (dev 热重载) + PostgreSQL + Nginx，一键 `docker-compose up`
- [ ] Express 后端骨架：中间件链（CORS 显式白名单、JSON body parser、结构化日志 Pino + traceId 注入、CSRF Token 校验、统一错误 handler）
- [ ] PostgreSQL 数据库 schema + Knex 迁移脚本，全部 6 张表：
  - `form_templates`（含 `version` INT 列、`status` ENUM draft/published/archived）
  - `form_instances`（含 `version` INT 列、`template_snapshot` JSONB、`field_values` JSONB）
  - `approval_records`
  - `drafts`（含 `expires_at`）
  - `notifications`
  - `users` + `roles` + `permissions`（含 `manager_id`、`department_id`）
  - 辅助表：`idempotency_keys`（`key` + `user_id` 唯一索引 + `created_at`）
- [ ] 数据库 seed：至少 1 个管理员、3 个普通用户（含直属上级关系）、1 个示例模板
- [ ] React + Vite 前端骨架：路由框架（设计器 /admin/* + 填写器 /*）+ 基础布局 + API base URL 配置（`/api/v1/`）
- [ ] 健康检查端点 `GET /api/v1/health` 返回 DB 连接状态
