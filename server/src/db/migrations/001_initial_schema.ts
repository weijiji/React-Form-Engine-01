import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ── Extensions ──────────────────────────────────────────────
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  // ── users ───────────────────────────────────────────────────
  await knex.schema.createTable("users", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("name", 100).notNullable();
    t.string("email", 255).notNullable().unique();
    t.string("password_hash", 255).notNullable();
    t.uuid("department_id").comment("Department the user belongs to");
    t.uuid("manager_id").comment("Direct manager — self-referencing FK to users");
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

    t.foreign("manager_id").references("id").inTable("users").onDelete("SET NULL");
  });

  // ── roles ───────────────────────────────────────────────────
  await knex.schema.createTable("roles", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("name", 100).notNullable().unique();
    t.string("description", 500);
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  // ── permissions ─────────────────────────────────────────────
  await knex.schema.createTable("permissions", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("code", 100).notNullable().unique();
    t.string("name", 200).notNullable();
    t.string("category", 100).notNullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  // ── users_roles (many-to-many) ──────────────────────────────
  await knex.schema.createTable("users_roles", (t) => {
    t.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.uuid("role_id").notNullable().references("id").inTable("roles").onDelete("CASCADE");
    t.primary(["user_id", "role_id"]);
  });

  // ── roles_permissions (many-to-many) ────────────────────────
  await knex.schema.createTable("roles_permissions", (t) => {
    t.uuid("role_id").notNullable().references("id").inTable("roles").onDelete("CASCADE");
    t.uuid("permission_id").notNullable().references("id").inTable("permissions").onDelete("CASCADE");
    t.primary(["role_id", "permission_id"]);
  });

  // ── form_templates ──────────────────────────────────────────
  await knex.schema.createTable("form_templates", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("name", 200).notNullable();
    t.text("description");
    t.string("category", 100);
    t.integer("version").notNullable().defaultTo(1).comment("Optimistic locking version (INT)");
    t.jsonb("schema").notNullable().defaultTo("{}").comment("Form structure definition (JSONB: sections, fields, validation, conditions). Contains schemaVersion field for format versioning.");
    t.jsonb("approval_chain").defaultTo("{}").comment("Approval chain configuration (JSONB: nodes array)");
    t.string("status", 20).notNullable().defaultTo("draft").comment("draft | published | archived");
    t.uuid("locked_by").comment("User who has the template checked out");
    t.timestamp("locked_at");
    t.uuid("created_by").notNullable().references("id").inTable("users").onDelete("RESTRICT");
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

    // CHECK constraint for status enum
    t.check("?? IN ('draft','published','archived')", ["status"]);
    // GIN index on JSONB schema for querying
    t.index(["schema"], undefined, { indexType: "GIN" });
    t.index(["status"]);
    t.index(["category"]);
    t.index(["created_by"]);
  });

  // ── form_instances ──────────────────────────────────────────
  await knex.schema.createTable("form_instances", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("template_id").notNullable().references("id").inTable("form_templates").onDelete("RESTRICT");
    t.jsonb("template_snapshot").notNullable().comment("Frozen copy of template schema at submission time");
    t.jsonb("field_values").notNullable().defaultTo("{}").comment("User-filled field values (JSONB)");
    t.string("status", 20).notNullable().defaultTo("draft").comment("draft | submitted | in_approval | approved | rejected | returned | withdrawn");
    t.integer("current_node_index").notNullable().defaultTo(0).comment("Current approval node index (0-based)");
    t.integer("version").notNullable().defaultTo(1).comment("Optimistic locking version (INT)");
    t.uuid("submitted_by").references("id").inTable("users").onDelete("SET NULL");
    t.timestamp("submitted_at");
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

    t.check("?? IN ('draft','submitted','in_approval','approved','rejected','returned','withdrawn')", ["status"]);
    t.index(["template_id"]);
    t.index(["status"]);
    t.index(["submitted_by"]);
    t.index(["field_values"], undefined, { indexType: "GIN" });
    t.index(["template_snapshot"], undefined, { indexType: "GIN" });
  });

  // ── approval_records ────────────────────────────────────────
  await knex.schema.createTable("approval_records", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("instance_id").notNullable().references("id").inTable("form_instances").onDelete("CASCADE");
    t.string("node_id", 100).notNullable().comment("Approval node ID from approval_chain");
    t.integer("node_order").notNullable().comment("Sequential order in the chain");
    t.uuid("approver_id").references("id").inTable("users").onDelete("SET NULL");
    t.string("action", 20).notNullable().defaultTo("pending").comment("pending | approved | rejected | returned | transferred");
    t.text("comment");
    t.uuid("transferred_from").comment("Original approver if transferred");
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("acted_at");

    t.check("?? IN ('pending','approved','rejected','returned','transferred')", ["action"]);
    t.index(["instance_id"]);
    t.index(["approver_id"]);
    t.index(["action"]);
  });

  // ── drafts ──────────────────────────────────────────────────
  await knex.schema.createTable("drafts", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("template_id").notNullable().references("id").inTable("form_templates").onDelete("CASCADE");
    t.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.jsonb("field_values").notNullable().defaultTo("{}");
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("expires_at").notNullable().defaultTo(knex.raw("NOW() + INTERVAL '2 years'"));

    t.index(["user_id"]);
    t.index(["template_id", "user_id"]);
  });

  // ── notifications ───────────────────────────────────────────
  await knex.schema.createTable("notifications", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("recipient_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.string("type", 50).notNullable().comment("Notification type enum");
    t.string("title", 200).notNullable();
    t.text("content");
    t.string("ref_type", 50).comment("Associated entity type: instance / template");
    t.uuid("ref_id").comment("Associated entity ID");
    t.boolean("is_read").notNullable().defaultTo(false);
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    t.check(
      "?? IN ('instance_submitted','instance_approved','instance_rejected','instance_returned','instance_transferred','instance_withdrawn','instance_completed')",
      ["type"]
    );
    t.index(["recipient_id", "is_read"]);
    t.index(["recipient_id", "created_at"]);
  });

  // ── idempotency_keys ────────────────────────────────────────
  await knex.schema.createTable("idempotency_keys", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("key", 255).notNullable();
    t.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.jsonb("response").notNullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    t.unique(["key", "user_id"]);
    t.index(["created_at"]);
  });

  // ── audit_logs ──────────────────────────────────────────────
  await knex.schema.createTable("audit_logs", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("user_id").references("id").inTable("users").onDelete("SET NULL");
    t.string("action", 100).notNullable();
    t.string("entity_type", 50).notNullable();
    t.uuid("entity_id");
    t.jsonb("details").defaultTo("{}");
    t.string("ip_address", 45);
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    t.index(["user_id"]);
    t.index(["entity_type", "entity_id"]);
    t.index(["created_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("audit_logs");
  await knex.schema.dropTableIfExists("idempotency_keys");
  await knex.schema.dropTableIfExists("notifications");
  await knex.schema.dropTableIfExists("drafts");
  await knex.schema.dropTableIfExists("approval_records");
  await knex.schema.dropTableIfExists("form_instances");
  await knex.schema.dropTableIfExists("form_templates");
  await knex.schema.dropTableIfExists("roles_permissions");
  await knex.schema.dropTableIfExists("users_roles");
  await knex.schema.dropTableIfExists("permissions");
  await knex.schema.dropTableIfExists("roles");
  await knex.schema.dropTableIfExists("users");
}
