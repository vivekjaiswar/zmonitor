exports.up = async function (knex) {
    // Named nms_incident, not incident - the existing "incident" table is a
    // manually-authored status-page announcement (title/content/style,
    // tied to status_page_id), a completely different concept with no
    // severity, root cause, affected-resource tracking, or lifecycle.
    // Confirmed via full reference trace (only 2 files touch it, both
    // status-page-specific) before deciding not to reuse it.
    await knex.schema.createTable("nms_incident", function (table) {
        table.increments("id");
        table.integer("user_id").unsigned().notNullable().references("id").inTable("user").onDelete("CASCADE");
        table
            .integer("root_node_id")
            .unsigned()
            .notNullable()
            .references("id")
            .inTable("graph_node")
            .onDelete("CASCADE");
        table.string("title", 255).notNullable();
        table.string("severity", 20).notNullable().defaultTo("CRITICAL");
        table.string("status", 20).notNullable().defaultTo("DETECTED");
        table.text("root_cause");
        table.timestamp("detected_at").notNullable().defaultTo(knex.fn.now());
        table.timestamp("acknowledged_at");
        table.timestamp("resolved_at");
        table.integer("assigned_user_id").unsigned().references("id").inTable("user").onDelete("SET NULL");
        table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
        table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

        table.index("user_id");
        table.index("root_node_id");
        table.index("status");
    });

    // One row per affected node per incident - lets impact scale to
    // however many PONs/ONUs/services/customers a failure actually
    // touches, rather than a fixed set of "affected POPs/devices/..."
    // columns.
    await knex.schema.createTable("nms_incident_impact", function (table) {
        table.increments("id");
        table
            .integer("incident_id")
            .unsigned()
            .notNullable()
            .references("id")
            .inTable("nms_incident")
            .onDelete("CASCADE");
        table.integer("node_id").unsigned().notNullable().references("id").inTable("graph_node").onDelete("CASCADE");
        table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

        table.unique(["incident_id", "node_id"]);
        table.index("incident_id");
        table.index("node_id");
    });

    // Timeline - "preserve a complete incident timeline" per the spec.
    await knex.schema.createTable("nms_incident_event", function (table) {
        table.increments("id");
        table
            .integer("incident_id")
            .unsigned()
            .notNullable()
            .references("id")
            .inTable("nms_incident")
            .onDelete("CASCADE");
        table.string("event_type", 30).notNullable(); // DETECTED, ACKNOWLEDGED, ASSIGNED, NOTE, RESOLVED, ...
        table.text("message");
        table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

        table.index("incident_id");
    });
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists("nms_incident_event");
    await knex.schema.dropTableIfExists("nms_incident_impact");
    await knex.schema.dropTableIfExists("nms_incident");
};
