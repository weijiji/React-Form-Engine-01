# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dynamic Form Engine — a configuration-driven form builder with approval workflows. Business users design form templates as JSON schemas; the engine renders them, drives validation/visibility/approval, and end users fill them through a unified UI. Target: single-tenant, Chinese-only MVP, ~50 concurrent fillers.

Architecture is **Schema → Engine → Component** (three layers). MVP stack: React 18 + Vite (client), Express + Knex + PostgreSQL JSONB (server), Vitest (tests), Docker Compose (deploy).

## Repository Layout

Monorepo with three packages plus docs. There is **no npm workspaces config** — each package has its own `package.json`/`node_modules` and is run by `cd`-ing into it (the root `package.json` only holds orchestration scripts).

- **`client/`** — React frontend. Vite dev server on port 5173, proxies `/api` → `localhost:3001`.
- **`server/`** — Express API server (port 3001). Knex migrations/seeds, Pino logging.
- **`shared/`** — package `form-engine-core`: the pure-logic engine. **Zero runtime dependencies.** It compiles to `dist/` (`npm run build:shared`); its `package.json` `exports` points at `./dist/index.js`. The **client** consumes the TypeScript source directly via a Vite alias to `../shared/src/index.ts`, while the **server** imports the compiled `dist` through a `file:../shared` dependency.
- **`docs/`** — product/design/UX specs, `design-system-form-engine.md` (design tokens + shared shell, ADR-0008), `adr/` (10 ADRs), and `spec-implementation-form-engine.md` (the implementation spec, contains the canonical test seams and error-code table).
- **`.scratch/form-engine-mvp/issues/`** — the 13 work orders (工单) that drive implementation. `13 个工单：执行顺序.md` maps their dependency graph and execution order.
- **`CONTEXT.md`** — the domain glossary (Chinese). The semantic authority for all terms: `FormTemplate`, `FormInstance`, `ApprovalRecord`, `Draft`, `OrgDataSource`, `schemaVersion`, etc. Read it before introducing or renaming domain concepts.

## Commands

All root scripts delegate via `cd <pkg> && …`. Run from the repo root unless noted.

```bash
# Development
npm run dev            # concurrently: server (nodemon+ts-node) + client (vite)

# Build / typecheck
npm run build          # build shared (tsc) → server (tsc) → client (tsc -b && vite build)
npm run typecheck      # build shared, then typecheck shared + server + client (tsc --noEmit)

# Tests (Vitest, shared package only)
npm test               # runs shared's vitest suite once
cd shared && npx vitest run                     # same, from the package
cd shared && npx vitest run test/schemaParser.test.ts   # a single test file
cd shared && npx vitest run -t "subform nesting"        # filter by test name
cd shared && npx vitest                          # watch mode

# Database (Knex — see note below)
npm run db:migrate          # knex migrate:latest
npm run db:migrate:rollback # knex migrate:rollback
npm run db:seed             # knex seed:run

# API types (spec-first, see ADR-0007)
npm run generate:api        # openapi-typescript openapi.yaml -o shared/src/api.ts
```

**Database note:** the server auto-runs migrations and seeds (seed only if `users` is empty) on startup — see `server/src/db/migrate.ts` and `server/src/index.ts`. Manual `db:*` scripts are for explicit control. Postgres runs via `docker compose up` (see `docker-compose.yml`); the app expects a `.env` at the repo root (copy `.env.example`).

## Core Architecture

### The engine (`shared/`)

Seven pure-logic modules, all exported from `shared/src/index.ts` and all consuming the domain types in `shared/src/types.ts`:

- **`SchemaParser`** — validates raw JSON → typed `ParsedSchema` IR. Enforces `schemaVersion` presence + major-version support (major `1` only, per ADR-0005), legal field types, subform nesting ≤ 2, and a well-formed approval chain. Rejections throw `SchemaParseError` with a machine-readable `code`.
- **`ValidationEngine`** — `validateField`/`validateAll`; rule types in `VALIDATION_RULE_TYPES` (`required` is a top-level boolean on the field, *not* a rule).
- **`ConditionEvaluator`** — evaluates a `ConditionNode` (leaf or implicit-AND group). MVP rejects `"or"` (ADR-0006), but the type admits it for forward-compat.
- **`VisibilityEngine`** — computes field/section visibility, including incremental recalculation via a dependency graph.
- **`FormStateManager`** — the reducer driving `FormState` (values/errors/visibility/disabled/touched/dirty/submitting). `setValue` → recompute visibility → recompute errors; `touched` only flips on `BLUR`.
- **`ApprovalStateMachine`** — 7 states × 6 actions transition table (terminal: `approved`/`rejected`). Role enforcement is layered *above* it; the machine is role-agnostic.
- **`ApprovalResolver`** — resolves an `ApproverRule` (`org_structure`/`role`/`specific`) to a `User` via the read-only `OrgDataSource` interface. Never throws; failures return `{ approver: null, reason }`.

Two `version` concepts must not be conflated (ADR-0005): `FormTemplate.version` / `FormInstance.version` (INT, optimistic locking) vs `schema.schemaVersion` (semver string, format version).

### The server (`server/`)

- `src/app.ts` builds the Express app. **Middleware order matters** and is documented in-file: `traceId → requestLogger → helmet → cors → cookieParser → json → csrf → routes → 404 → errorHandler`.
- `src/index.ts` initializes the DB (connection check + migrate + seed) and starts the server in **degraded mode** on DB failure (health endpoint reports it instead of crashing).
- Error handling: throw `AppError` (from `middleware/errorHandler.ts`) for known errors; the unified handler returns `{ error: { code, message, details? } }`. Error codes are enumerated in `docs/spec-implementation-form-engine.md`.
- All routes use the `/api/v1/` prefix (ADR-0005). CSRF is enforced for mutating methods via `X-CSRF-Token` header matched against the `xsrf-token` cookie (MVP permissive when no cookie is set). Every request gets an `X-Trace-Id`.

### The client (`client/`)

- Routing via `react-router-dom` `createBrowserRouter` in `client/src/router/index.tsx`. **5 path-prefix areas** (`/designer` `/filler` `/approver` `/admin` `/ops`) are pure URL organization, NOT a portal concept (ADR-0010, supersedes ADR-0009). Every authenticated page renders inside one shared `Shell` (`client/src/layouts/Shell.tsx`) with a unified sidebar filtered by permission codes (`APP_NAV` + `filterNavGroups`); each page is gated on its own codes via the `ROUTE_CODES` map shared by nav items and route guards. The root `/` lands on the first nav item the user's codes unlock (`HomeRedirect`). The full route map (~40 routes) lives in `docs/sitemap-form-engine.md`.
- API access goes through `apiClient<T>` in `client/src/config/api.ts`, which injects the CSRF token for mutating requests and parses the error envelope into `ApiError`. New endpoints should consume the generated types from `shared/src/api.ts` rather than hand-written generics (ADR-0007).

### Spec-first API contract

`openapi.yaml` (repo root) is the hand-written API contract (single source of truth). `npm run generate:api` runs `openapi-typescript` to emit **pure types** (no runtime) into `shared/src/api.ts`. Currently only `GET /api/v1/health` + shared schemas/headers are modelled; endpoints are added per work order. SSE streams (notifications) are deliberately *not* in the OpenAPI doc.

## Key Architectural Decisions (see `docs/adr/`)

- **ADR-0001** — submit/approve writes (Instance + Snapshot + ApprovalRecord) in one DB transaction; notification persist + SSE push are async, after commit.
- **ADR-0002** — approval writes require an `Idempotency-Key` header (24h window); `submit` does not.
- **ADR-0003** — optimistic locking via `version` INT columns; 0-rows-affected → 409 `VERSION_CONFLICT`.
- **ADR-0004** — draft/template version-mismatch: best-effort fieldId migration, orphans go to `_orphaned`.
- **ADR-0005** — `/api/v1/` prefix; `schemaVersion` semver in every JSONB schema; same-major import accepted.
- **ADR-0006** — MVP condition editor is flat AND only; data format has an upgrade path to nested AST.
- **ADR-0007** — spec-first OpenAPI + `openapi-typescript` codegen (see above).
- **ADR-0008** — design system source of truth: prototype「Canvas Workbench」tokens (indigo) + one shared shell; antd palette retired.
- **ADR-0010** — permission-driven access model (supersedes ADR-0009): no portals; permission codes are the single source of truth, each page gates on its own codes via the shared `ROUTE_CODES` map, `/` lands on the first unlocked nav item.

## Testing Approach

The implementation spec (`docs/spec-implementation-form-engine.md`) defines four test seams, inner-to-outer. Pure-logic engine modules (一级 seam) are the highest-value unit-test target — they have no DOM/DB/network and currently carry the full Vitest suite under `shared/test/`. Prefer testing **external behavior** over internals; error paths should get at least as much coverage as happy paths. Property-based tests are used for the approval state machine (see `shared/test/approvalStateMachine.property.test.ts`).

## Workflow Conventions

Implementation is driven by numbered work orders in `.scratch/form-engine-mvp/issues/` (TDD → code review → commit per order). The intent is one work order per clean context window. When implementing, follow the spec-first contract (update `openapi.yaml` then regenerate types) and keep domain terminology aligned with `CONTEXT.md`.


## Others
AI should always communicate with users in Chinese.