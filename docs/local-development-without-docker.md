# 本地开发（不使用 Docker）指南

> 面向开发者的本地开发环境搭建说明。本项目代码本身即为「本地直连」设计，Docker 只是把 PostgreSQL 跑起来的便利容器编排，**不是开发必需项**。

## 结论

- 可以完全脱离 Docker 继续开发。
- `shared/`（表单引擎，纯逻辑、零运行时依赖）与 `client/`（Vite 前端）**无需任何 Docker / 数据库**即可开发、测试。
- `server/`（Express）**唯一外部依赖是 PostgreSQL**，本地装一个即可；服务端代码兜底配置已指向 `localhost:5432`。
- 唯一需要绕开的坑：`.env.example` 里的 `DATABASE_URL` 使用了 Docker 网络主机名 `postgres`，本地环境不解析，需要改为 `localhost`。

## 架构前提（为什么可行）

| 层 | 是否需要 Docker | 说明 |
|---|---|---|
| `shared/` 表单引擎 | ❌ | 纯逻辑、零依赖，`npm test`（Vitest）独立运行 |
| `client/`（Vite :5173） | ❌ | `npm run dev:client` 即可；`vite.config.ts` 代理 `/api` → `http://localhost:3001` |
| `server/`（Express :3001） | ⚠️ 仅需本地 Postgres | `server/src/config/index.ts` 与 `server/knexfile.ts` 兜底均指向 `localhost:5432` |

## 前置条件

- Node.js（与 `package.json` 中 `engines` / lockfile 匹配的版本）
- PostgreSQL **16+**（本机监听 `localhost:5432`）
- 各包依赖已安装（`npm install`，root + `shared/` + `server/` + `client/` 各自安装）

## 配置步骤

### 1. 准备本地 PostgreSQL

创建角色与数据库（二选一）：

- **方式 A —— 使用默认值（零配置，与代码兜底完全一致）**：

  ```sql
  CREATE ROLE form_engine LOGIN PASSWORD 'form_engine_pass';
  CREATE DATABASE form_engine_db OWNER form_engine;
  ```

- **方式 B —— 自定义**：任意用户名 / 密码 / 库名，在 `.env` 中写入对应的 `DATABASE_URL` 即可。

### 2. 修改 `.env.example`（推荐，防踩坑）

将 `DATABASE_URL` 的主机名从 Docker 网络名 `postgres` 改为 `localhost`：

```env
# 改前
DATABASE_URL=postgresql://form_engine:form_engine_pass@postgres:5432/form_engine_db
# 改后
DATABASE_URL=postgresql://form_engine:form_engine_pass@localhost:5432/form_engine_db
```

> **为什么安全**：`docker-compose.yml` 中 `server` 服务的 `DATABASE_URL` 是显式硬编码为 `@postgres`，不读取 `.env.example`，因此修改模板不影响 Docker 部署。

### 3. 生成 `.env`

从模板复制（或干脆不建 `.env`，代码兜底即 `localhost`，也能工作）：

```bash
copy .env.example .env
```

> 若根目录已存在 `.env`，请核对其中 `DATABASE_URL` 的 host 是 `localhost` 而非 `postgres`。

## 验证清单

按顺序执行：

| # | 命令 | 预期结果 |
|---|---|---|
| 1 | `npm test` | `shared/` 引擎单测全绿（无需 DB），注意要分别在 `/shared` 和 `/server`（假定仍然是NodeJs，没有变更其他技术栈） 目录执行 `npm install` |
| 2 | `npm run typecheck` | `shared` + `server` + `client` 三包 `tsc --noEmit` 无错误 |
| 3 | `npm run dev` | 同时启动 `server:3001`（nodemon+ts-node）与 `client:5173`（vite）；server 日志出现 `Database connection established successfully`，并自动完成迁移 + 种子 |
| 4 | 打开 `http://localhost:5173` 或访问 `curl http://localhost:3001/api/v1/health` | 页面正常渲染 / health 返回正常（DB 就绪） |
| 5 | （可选，手动控制）`npm run db:migrate`、`npm run db:seed` | 迁移 / 种子执行成功（服务启动时也会自动执行） |

> 迁移与种子在服务启动时自动运行（`server/src/db/migrate.ts`：迁移幂等；种子仅在 `users` 表为空时执行），无需手动干预。

## 明确不需要做的事

- ❌ 不修改任何 TypeScript 源码、`vite.config.ts`、根 `package.json` 脚本 —— 它们本来就是本地直连设计。
- ❌ 不需要 `docker compose up`；`nginx` 服务仅用于模拟生产部署，开发期无用。
- ⚠️ **不要同时** `docker compose up` 与本地 Postgres，两者都会占用 `5432` 端口，会冲突。

## 常见问题

### 1. 没有本地 Postgres 时怎么办？

`server/src/index.ts` 采用**降级模式**：数据库初始化失败时服务照常启动，由 `/api/v1/health` 上报数据库异常而不是崩溃。因此：

- `shared/` 引擎、`client/` 前端可全量推进；
- `server/` 可起骨架，但依赖 DB 的路由会失败，DB 相关联调需等环境就绪。

### 2. 本地 5432 端口被其他服务占用？

在 `.env` 中把 `DATABASE_URL` 指向你的实际端口（如 `...@localhost:5433/...`），或停止占用进程。

### 3. 手动跑迁移/种子与自动执行的关系？

自动执行（启动时）与手动命令（`npm run db:migrate` / `npm run db:seed`）等价且幂等，可放心混用。手动命令经 `server/knexfile.ts` 读取 `.env`（`../.env`）。

## 相关文件

- `server/src/config/index.ts` —— server 运行时配置（`DATABASE_URL` 兜底 `localhost`）
- `server/knexfile.ts` —— Knex CLI 配置（development 兜底 `localhost`）
- `server/src/db/` —— 连接池 / 迁移 / 种子
- `client/vite.config.ts` —— Vite 代理（`/api` → `localhost:3001`）
- `docker-compose.yml` —— 容器化部署（与本地开发互不影响）
