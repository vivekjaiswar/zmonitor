exports.up = async function (knex) {
    await knex.schema.createTable("customer", function (table) {
        table.increments("id");
        table.integer("user_id").unsigned().notNullable().references("id").inTable("user").onDelete("CASCADE");
        table.string("name", 255).notNullable();
        table.string("contact", 255);
        table.string("status", 20).notNullable().defaultTo("active");
        table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
        table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

        table.index("user_id");
    });

    await knex.schema.createTable("service", function (table) {
        table.increments("id");
        table
            .integer("customer_id")
            .unsigned()
            .notNullable()
            .references("id")
            .inTable("customer")
            .onDelete("CASCADE");
        // Nullable and set-null-on-delete: a service can exist before an
        // ONU/monitor is assigned to it, and losing the monitor (device
        // decommissioned, re-provisioned under a new one) shouldn't take
        // the customer/service record down with it.
        table
            .integer("monitor_id")
            .unsigned()
            .references("id")
            .inTable("monitor")
            .onDelete("SET NULL");
        table.string("status", 20).notNullable().defaultTo("active");
        table.string("plan", 255);
        table.string("ip_address", 45); // fits IPv4 and IPv6
        table.string("mac_address", 17);
        table.integer("vlan").unsigned();
        table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
        table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

        table.index("customer_id");
        table.index("monitor_id");
    });
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists("service");
    await knex.schema.dropTableIfExists("customer");
};
