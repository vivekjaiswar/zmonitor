exports.up = async function (knex) {
    await knex.schema.alterTable("monitor", function (table) {
        table.string("snmp_mode", 20).notNullable().defaultTo("oid");
    });

    await knex.schema.createTable("monitor_interface", function (table) {
        table.increments("id");
        table
            .integer("monitor_id")
            .unsigned()
            .notNullable()
            .references("id")
            .inTable("monitor")
            .onDelete("CASCADE")
            .onUpdate("CASCADE");
        table.integer("if_index").notNullable();
        table.string("if_name", 255);
        table.bigInteger("if_speed").comment("Interface speed in bits/sec, from ifHighSpeed/ifSpeed");
        table.string("if_oper_status", 20);
        table.bigInteger("last_in_octets").comment("Raw counter value from the most recent poll");
        table.bigInteger("last_out_octets").comment("Raw counter value from the most recent poll");
        table.boolean("last_counters_are_hc").comment("Whether last_in_octets/last_out_octets came from the 64-bit HC counters");
        table.integer("last_poll_at").comment("Unix timestamp of the most recent poll");

        table.unique(["monitor_id", "if_index"]);
    });

    await knex.schema.createTable("interface_sample", function (table) {
        table.increments("id");
        table
            .integer("interface_id")
            .unsigned()
            .notNullable()
            .references("id")
            .inTable("monitor_interface")
            .onDelete("CASCADE")
            .onUpdate("CASCADE");
        table.integer("timestamp").notNullable().comment("Unix timestamp of this sample");
        table.float("in_bps");
        table.float("out_bps");
        table.integer("in_errors");
        table.integer("out_errors");

        table.index(["interface_id", "timestamp"]);
    });
};

exports.down = async function (knex) {
    await knex.schema.dropTable("interface_sample");
    await knex.schema.dropTable("monitor_interface");
    await knex.schema.alterTable("monitor", function (table) {
        table.dropColumn("snmp_mode");
    });
};
