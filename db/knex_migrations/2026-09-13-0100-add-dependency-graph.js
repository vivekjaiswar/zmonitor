exports.up = async function (knex) {
    await knex.schema.createTable("graph_node", function (table) {
        table.increments("id");
        table.integer("user_id").unsigned().notNullable().references("id").inTable("user").onDelete("CASCADE");
        // NODE type per the spec: DEVICE, INTERFACE, POP, OLT, PON, ONU,
        // SERVICE, CUSTOMER today; ROUTER/SWITCH/BGP_PEER/UPLINK are
        // extension points, not populated yet.
        table.string("node_type", 20).notNullable();
        // Which real table this node wraps ('monitor', 'customer', 'service')
        // and its id there - a graph node is never freestanding data, always
        // a pointer to something that already exists.
        table.string("ref_table", 20).notNullable();
        table.integer("ref_id").unsigned().notNullable();
        table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

        table.unique(["ref_table", "ref_id"]);
        table.index("user_id");
        table.index("node_type");
    });

    await knex.schema.createTable("graph_edge", function (table) {
        table.increments("id");
        table
            .integer("from_node_id")
            .unsigned()
            .notNullable()
            .references("id")
            .inTable("graph_node")
            .onDelete("CASCADE");
        table
            .integer("to_node_id")
            .unsigned()
            .notNullable()
            .references("id")
            .inTable("graph_node")
            .onDelete("CASCADE");
        // EDGE type per the spec: DEPENDS_ON, CONNECTED_TO, SERVES, CONTAINS,
        // UPSTREAM, DOWNSTREAM. Directional (from -> to); traversal in the
        // reverse direction is a query concern (WHERE to_node_id = ?), not a
        // second stored edge.
        table.string("edge_type", 20).notNullable();
        table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

        table.unique(["from_node_id", "to_node_id", "edge_type"]);
        table.index("from_node_id");
        table.index("to_node_id");
    });
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists("graph_edge");
    await knex.schema.dropTableIfExists("graph_node");
};
