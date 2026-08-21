import type { Knex } from "knex";

/**
 * ADR-0014: 草稿模型统一 —— 独立 Draft 实体并入草稿状态 FormInstance。
 * 删除 `drafts` 表：草稿即 `form_instances.status = 'draft'` 的实例，自动保存是
 * 唯一持久化路径。保留策略（BR-15：2 年无活动清除）由 form_instances 的
 * `updated_at` 谓词承担（见 draftPurge.ts / instances.ts）。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("drafts");
}

/** Rollback: 重建与 001 同构的 drafts 表（含 2 年 expires_at 默认值）。 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.createTable("drafts", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("template_id")
      .notNullable()
      .references("id")
      .inTable("form_templates")
      .onDelete("CASCADE");
    t.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.jsonb("field_values").notNullable().defaultTo("{}");
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("expires_at").notNullable().defaultTo(knex.raw("NOW() + INTERVAL '2 years'"));

    t.index(["user_id"]);
    t.index(["template_id", "user_id"]);
  });
}
