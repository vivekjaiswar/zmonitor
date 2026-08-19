exports.up = async function (knex) {
    await knex.schema.alterTable("user", function (table) {
        table.boolean("full_monitor_access").notNullable().defaultTo(false);
    });
};

exports.down = async function (knex) {
    await knex.schema.alterTable("user", function (table) {
        table.dropColumn("full_monitor_access");
    });
};
