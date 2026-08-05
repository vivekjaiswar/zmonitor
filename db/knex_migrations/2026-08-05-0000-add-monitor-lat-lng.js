exports.up = function (knex) {
    return knex.schema.alterTable("monitor", function (table) {
        table.double("lat").defaultTo(null);
        table.double("lng").defaultTo(null);
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable("monitor", function (table) {
        table.dropColumn("lat");
        table.dropColumn("lng");
    });
};
