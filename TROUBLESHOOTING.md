# TROUBLESHOOTING — 本地开发排障手册

> 本手册记录本机（Windows）开发环境的已知问题、排查方法与解决方案。
> 注意：这不是正式 spec 文档，属于工程实践备忘，随环境变化持续维护。

---

## 0. 本机环境速查表（当前实际状态）

| 项 | 状态 | 说明 |
|----|------|------|
| 原生 PostgreSQL | **PostgreSQL 18**，Windows 服务 `postgresql-x64-18`，**常驻运行** | 占用宿主 **5432**；安装时默认只有 `postgres` 超级用户，**没有 `form_engine` 角色** |
| 项目数据库 | Docker 容器 **`form-engine-db`**（postgres:16-alpine） | 宿主映射 **`5433 → 容器 5432`**；含 `form_engine` 角色 + `form_engine_db` 库 |
| 连接入口 | 根目录 `.env` → `postgresql://form_engine:form_engine_pass@localhost:5433/form_engine_db` | 服务器启动时读取；无 `.env` 时回落到默认 5432 连接串 |
| 种子账号 | `admin@example.com / admin123`；`zhangsan / lisi / wangwu @example.com / user123` | 首次启动自动 seed（`users` 表为空时） |
| 启动方式 | 数据库：`docker compose up -d postgres`；应用：`npm run dev` | 服务器启动时自动跑迁移 + seed |

> ⚠️ **为什么用 5433 而不是 5432**：5432 被本机原生 PG18 长期占用（本机无管理员权限停止该服务），
> 为避免端口冲突，项目 Docker 数据库改走 5433。**Docker 容器内部仍用 5432**，只有宿主访问走 5433。
> 若日后取得管理员权限想改回：停用 `postgresql-x64-18` → compose 端口改回 `5432:5432` → `.env` 改回 5432。

---

## 1. 场景一：数据库初始化失败 / degraded mode

### 症状

```
ERROR: Failed to initialize database — server starting in degraded mode
err: {
  "type": "DatabaseError",
  "message": "��ɫ \"form_engine\" ������",   // ← GBK 中文被按 UTF-8 显示成乱码
  "code": "28000",
  "routine": "InitializeSessionUserId"
}
```

- 服务器**不崩溃**，照常启动，但健康检查报告 `db: 未连接`（这是设计好的降级兜底）。
- 乱码解码：`角色 "form_engine" 不存在`（role "form_engine" does not exist）。

### 根因

**服务器连到的不是项目要用的数据库。** 连接串 `@localhost:5432` 命中的是本机原生 PG18（它没有 `form_engine` 角色），而项目真正的数据库（Docker `form-engine-db`，会自动创建该角色）**没有启动**。

判定要点：
- `code 28000` + `InitializeSessionUserId` → 登录认证阶段失败，具体是**角色不存在**（若是密码错，会是 "password authentication failed"）。
- 一句话：不是配置写错，而是**连错了门牌号**。

### 排查步骤（按序执行）

```powershell
# 1) 是否创建了 .env？服务器实际用什么连接串？
Test-Path .env

# 2) 项目 Docker 数据库在不在跑？
docker compose ps
docker compose ls        # 无项目 = 数据库从未启动

# 3) 5432 到底被谁占着？
Get-NetTCPConnection -LocalPort 5432 -State Listen |
  Select-Object LocalAddress, LocalPort, OwningProcess

# 4) 确认占用进程是"本机安装"还是"Docker"
Get-CimInstance Win32_Process -Filter "ProcessId = <PID>" |
  Select-Object Name, ExecutablePath, CommandLine

# 5) 若是本机服务
Get-Service | Where-Object { $_.Name -like '*postgres*' }
```

### 解决方案（方案 A：用回项目 Docker 数据库）

```powershell
# 启动项目数据库（首次会自动建角色/库/扩展，见 docker/postgres/init.sql）
docker compose up -d postgres
docker compose ps        # 等 STATUS 变为 (healthy)
docker exec form-engine-db psql -U form_engine -d form_engine_db -t \
  -c "SELECT current_user || ' @ ' || current_database();"

# 用服务器实际连接串验证宿主侧连通性
Push-Location server
node -e "const {Client}=require('pg');const c=new Client({connectionString:'postgresql://form_engine:form_engine_pass@localhost:5433/form_engine_db'});c.connect().then(()=>c.query('SELECT 1 as ok')).then(r=>{console.log('OK',r.rows[0].ok);return c.end()}).catch(e=>{console.error('FAIL',e.message);process.exit(1)})"
Pop-Location

# 然后正常启动
npm run dev
```

---

## 2. 场景二：端口被占用（EADDRINUSE）

### 症状

```
Error: listen EADDRINUSE: address already in use :::3001
[0] [nodemon] app crashed - waiting for file changes before starting...
```

（Vite 前端同理：`Port 5173 is in use, trying another one...`）

### 根因

之前启动的 `npm run dev` 实例还活着，占着 3001（服务端）和 5173（前端）。常见于：旧实例进入 degraded mode 后你以为它挂了，其实进程仍在。

### 排查与清理（认准进程树再杀，别乱杀）

```powershell
# 1) 谁占端口
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in 3001,5173 } |
  ForEach-Object { $p=Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)" -ErrorAction SilentlyContinue;
    [PSCustomObject]@{Port=$_.LocalPort;PID=$_.OwningProcess;Name=$p.Name} } | Format-Table

# 2) 向上找进程树根（nodemon 会复活子进程，必须连根杀）
$cur = <PID>; while ($cur) { $p=Get-CimInstance Win32_Process -Filter "ProcessId=$cur" -ErrorAction SilentlyContinue;
  if (-not $p){break}; "{0}`t{1}" -f $p.ProcessId,$p.Name; $cur=$p.ParentProcessId }

# 3) 整棵杀掉（/T 连带子进程，/F 强制）
taskkill /PID <根PID> /T /F
```

> ⚠️ **不要只杀叶子进程**（如 ts-node），它的父进程 nodemon 会把它自动重启、继续占端口。

---

## 3. 通用排障认知模型

1. **连接串 = 门牌号**。连不上（connection refused）= 门牌号没人；认证失败（28xxx）= 门牌号有人但"不是你要找的人"。
2. **Docker 端口映射是转发**：`5433:5432` = 宿主 5433 → 容器内 5432。容器内部永远用 5432，只有宿主访问才用 5433；所以服务器容器连 `@postgres:5432` 不受影响。
3. **`postgres.exe` 不一定来自 Docker**，可能是本机安装的服务。端口被占先 `Get-NetTCPConnection` 查 OwningProcess，再查进程身份。
4. **degraded mode 是设计好的兜底**：数据库挂了服务器不崩、照常启动，通过健康检查报告问题——所以"服务器活着"不等于"数据库正常"。
5. **杀进程要看进程树**：认准根再 `/T` 整棵杀，避免父进程复活子进程。
6. **中文乱码多为编码错位**：PostgreSQL 中文错误消息是 GBK，日志按 UTF-8 显示即乱码；`code`/`routine` 字段才是权威判定依据。

---

## 4. 常用命令速查

```powershell
# ---- Docker ----
docker compose up -d postgres     # 只启动数据库
docker compose up -d              # 启动整个栈（db+server+client+nginx）
docker compose down               # 停止（保留数据卷）
docker compose down -v            # 停止并删除数据卷（清空重来）
docker compose ps                 # 容器状态/健康
docker exec -it form-engine-db psql -U form_engine -d form_engine_db  # 进库
docker logs form-engine-db        # 看数据库日志
docker rm <name>                  # 清理孤立容器（先 docker ps -a 确认）

# ---- 端口 / 进程 ----
Get-NetTCPConnection -LocalPort <port> -State Listen          # 谁监听某端口
Get-CimInstance Win32_Process -Filter "ProcessId=<PID>"       # 进程详情
taskkill /PID <PID> /T /F                                     # 整棵杀进程树

# ---- 应用 ----
npm run dev                       # 服务端(3001) + 前端(5173)
Invoke-RestMethod http://localhost:3001/api/v1/health         # 健康检查
```
