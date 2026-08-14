# React Form Engine — 动态表单引擎

配置驱动的动态表单引擎，支持表单设计、填写、审批流。架构为 **Schema → Engine → Component** 三层：React 18 + Vite（前端）、Express + Knex + PostgreSQL JSONB（后端）、Vitest（测试）、Docker Compose（部署）。

Monorepo 结构：`client/`（前端）、`server/`（后端 API）、`shared/`（纯逻辑引擎 `form-engine-core`）、`docs/`（规格文档）。

---

## 快速开始（本地开发，推荐）

> 本机环境要点：本机原生 PostgreSQL 18 服务常驻占用 **5432**，因此项目 Docker 数据库走 **5433**（见 `.env`，无需改动）。

### 0. 前置条件

| 依赖 | 说明 |
|------|------|
| Node.js ≥ 18 | 运行 `npm run dev` |
| Docker Desktop | 运行数据库容器 `form-engine-db` |
| 根目录 `.env` | 已配置好连接串，一般无需改动（复制自 `.env.example`） |

### 1. 启动数据库（Docker）

```powershell
docker compose up -d postgres
docker compose ps        # 等 STATUS 变为 (healthy)
```

首次启动会自动创建 `form_engine` 角色、`form_engine_db` 库并执行 `docker/postgres/init.sql`（扩展）。

### 2. 启动应用（服务端 3001 + 前端 5173）

```powershell
npm run dev
```

启动日志应看到：

```
INFO: Database connection established successfully
INFO: Applied N migration(s) ...
INFO: Server started on port 3001 [development]
```

- 前端：http://localhost:5173 （Vite 支持热更新）
- 健康检查：http://localhost:3001/api/v1/health → `{ "status": "ok", "db": "connected" }`
- 数据库迁移与种子数据由服务器**启动时自动执行**（无需手动跑）

### 3. 种子账号

| 角色 | 账号 | 密码 |
|------|------|------|
| 系统管理员 | `admin@example.com` | `admin123` |
| 模板设计者 | `designer@example.com` | `user123` |
| 运维人员 | `ops@example.com` | `user123` |
| 填写者/审批者 | `zhangsan@example.com` | `user123` |
| 填写者 | `lisi@example.com` / `wangwu@example.com` | `user123` |

> 种子仅在 `users` 表为空时执行。示例模板：「IT设备申领表」（已发布）。

### 4. 停止

```powershell
# 停止应用：在运行 npm run dev 的终端按 Ctrl+C

# 停止数据库（保留数据卷）
docker compose down

# 停止并删除数据库数据（清空重来）
docker compose down -v
```

---

## 全栈 Docker 启动（DB + Server + Client + Nginx）

```powershell
docker compose up --build
```

| 服务 | 端口 |
|------|------|
| postgres（`form-engine-db`） | 宿主 **5433** → 容器 5432 |
| server | 3001 |
| client (vite) | 5173 |
| nginx | 80 |

> ⚠️ **重要**：全栈模式要求 **3001 / 5173 / 80 端口空闲**。若已用 `npm run dev` 启动了本地应用（占着 3001、5173），请先停掉再 `docker compose up`，否则容器会因 `EADDRINUSE` 启动失败（exit 1）。
>
> Docker 容器内部，server 通过 `@postgres:5432` 连库，不受宿主 5433 映射影响。

---

## 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式（服务端 nodemon + 前端 vite） |
| `npm run build` | 构建 server + client |
| `npm run typecheck` | 类型检查 shared + server + client |
| `npm test` | 运行 shared 包 Vitest 测试 |
| `npm run db:migrate` | 手动执行数据库迁移（通常无需，启动时自动跑） |
| `npm run db:seed` | 手动执行种子数据 |
| `npm run generate:api` | 由 `openapi.yaml` 重新生成 API 类型到 `shared/src/api.ts` |

---

## 环境变量（根目录 `.env`）

以 `.env.example` 为模板。核心项：

```env
DATABASE_URL=postgresql://form_engine:form_engine_pass@localhost:5433/form_engine_db
POSTGRES_USER=form_engine
POSTGRES_PASSWORD=form_engine_pass
POSTGRES_DB=form_engine_db
JWT_SECRET=change-me-in-production-use-a-strong-random-string
```

`.env` 已被 `.gitignore` 忽略，不会提交到仓库。

---

## 排障

常见问题（数据库 degraded mode、端口被占、进程清理）见根目录 **`TROUBLESHOOTING.md`**。
