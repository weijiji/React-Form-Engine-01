# BUG-04 — 设计器缺少「模板基本信息」编辑入口（模板名/描述/分类不可修改）

**Status:** open
**记录日期:** 2026-08-19
**类型:** 功能缺口

## 现象

在「设计器」界面，模板顶部信息栏（`.editor-top`）仅**展示**模板名、创建时间、
版本号，没有任何「编辑基本信息」的入口；模板名、模板描述、模板分类创建后
无法修改。

## 复现步骤

1. 设计者进入任一模板的设计器（`/designer/templates/:id`）
2. 观察顶部 `.editor-top`：仅见 `et-name`（名称）、`et-sub`（创建时间 · v版本）
3. 尝试修改模板名称 / 描述 / 分类：界面无任何编辑入口（无改名、无设置按钮、
   无可点击的表单）

## 期望行为

- 提供「编辑基本信息」入口（如顶部设置按钮 / 抽屉 / 弹窗）
- 可修改：模板名、模板描述、模板分类；保存后同步列表与详情展示

## 实际行为

- 基本信息只读展示，无编辑入口，改名/改描述/改分类均不可行

## 涉及范围

- 前端：`client/src/pages/designer/DesignerPage.tsx`（`.editor-top` 信息栏）、
  `designer.css`
- 后端：`server/src/routes/templates.ts`（`PUT /templates/:id/schema` 仅更新
  schema + approval_chain，**无基本信息更新接口**）
- API 契约：`openapi.yaml` + `shared/src/api.ts`（需建模基本信息更新端点）
- 原型参考：`prototype/designer-edit.html`（原型信息栏应有编辑能力）

## 根因分析

设计器信息栏是「只读展示」实现，未落地原型的「基本信息可编辑」能力；
后端 schema 更新接口也未覆盖 name / description / category 字段。

## 严重程度 / 优先级

中（模板信息管理能力缺口：模板发布后无法修正名称/描述/分类，
影响列表检索与用户识别）

## 建议修复方向（参考）

1. 后端：新增 `PATCH /api/v1/templates/:id/meta`（或扩展 `PUT /:id`）更新
   name / description / category，含校验与乐观锁（version）
2. 契约：`openapi.yaml` 建模 + `npm run generate:api`
3. 前端：`.editor-top` 增加「编辑基本信息」入口（弹窗/抽屉），保存后刷新
4. 测试：后端路由测试 + `client` 相关组件测试补齐

## 关联工单

- `issues/04-template-api-form-designer.md`（设计器）
- `issues/20-template-delete-button.md`（模板操作的既有实现）
