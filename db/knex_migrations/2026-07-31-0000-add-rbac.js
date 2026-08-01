exports.up = async function (knex) {
    await knex.schema.alterTable("user", function (table) {
        table.string("role", 20).notNullable().defaultTo("admin");
    });

    await knex.schema.createTable("user_tag_access", function (table) {
        table.increments("id");
        table.integer("user_id").unsigned().notNullable().references("id").inTable("user").onDelete("CASCADE");
        table.integer("tag_id").unsigned().notNullable().references("id").inTable("tag").onDelete("CASCADE");
        table.unique(["user_id", "tag_id"]);
    });

    await knex.schema.createTable("user_monitor_access", function (table) {
        table.increments("id");
        table.integer("user_id").unsigned().notNullable().references("id").inTable("user").onDelete("CASCADE");
        table
            .integer("monitor_id")
            .unsigned()
            .notNullable()
            .references("id")
            .inTable("monitor")
            .onDelete("CASCADE");
        table.unique(["user_id", "monitor_id"]);
    });
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists("user_monitor_access");
    await knex.schema.dropTableIfExists("user_tag_access");
    await knex.schema.alterTable("user", function (table) {
        table.dropColumn("role");
    });
};
