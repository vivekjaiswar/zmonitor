<template>
    <transition name="slide-fade" appear>
        <div>
            <h1 class="mb-3">{{ $t("Network Map") }}</h1>

            <p v-if="unmappedCount > 0" class="form-text mb-2">
                {{ $t("mapUnmappedCount", { count: unmappedCount }) }}
            </p>

            <div class="map-shell">
                <div class="map-main">
                    <div v-if="tilesUnavailable" class="tiles-unavailable shadow-box mb-3">
                        <p class="mb-2">{{ $t("mapTilesUnavailable") }}</p>
                        <ul class="mb-0">
                            <li v-for="m in mappedMonitors" :key="m.id">
                                <span :class="'dot dot-' + statusClass(m)"></span>
                                {{ m.name }}
                            </li>
                        </ul>
                    </div>

                    <div v-else id="network-map" class="shadow-box"></div>
                </div>

                <!-- Severity-first: what's broken gets the most visual weight, healthy monitors collapse. -->
                <aside class="severity-pane shadow-box">
                    <div class="severity-header">{{ $t("mapNeedsAttention") }}</div>

                    <p v-if="attentionMonitors.length === 0" class="severity-empty">
                        {{ $t("mapAllHealthy") }}
                    </p>

                    <div
                        v-for="m in attentionMonitors"
                        :key="m.id"
                        class="severity-card"
                        :class="'severity-' + statusClass(m)"
                    >
                        <div class="severity-name">{{ m.name }}</div>
                        <div class="severity-meta">
                            {{ statusList[m.id]?.text }}
                            <template v-if="lastHeartbeatList[m.id]">
                                &middot; {{ $t("Last Check") }} <Datetime :value="lastHeartbeatList[m.id].time" />
                            </template>
                        </div>
                    </div>

                    <div v-if="healthyCount > 0" class="healthy-strip">
                        <span class="dot dot-up"></span>
                        {{ $t("mapHealthyCount", { count: healthyCount }) }}
                    </div>
                </aside>
            </div>
        </div>
    </transition>
</template>

<script>
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Datetime from "../components/Datetime.vue";

// Worst-first ordering for the severity pane: down before pending/warning
// before maintenance. Anything not listed (success, unknown) never appears
// in the "needs attention" list at all.
const SEVERITY_ORDER = { danger: 0, warning: 1, maintenance: 2 };

const POLL_INTERVAL_MS = 30 * 1000;
// A few consecutive tile failures right after load means the tile server is
// genuinely unreachable, not a couple of dropped tiles at the edge of the
// viewport - avoids flipping to the fallback list on ordinary network blips.
const TILE_ERROR_THRESHOLD = 6;

// Colorblind-safe: pair color with shape, not color alone (design decision
// carried over from the roadmap's signal-health work - applies here too).
// Keyed by $root.statusList's existing semantic color names, reusing that
// already-tested up/down/pending/maintenance/unknown derivation as-is.
const STATUS_STYLE = {
    success: { color: "#2f7d5a", shape: "circle" },
    danger: { color: "#c6473a", shape: "triangle" },
    warning: { color: "#8b93a0", shape: "square" },
    maintenance: { color: "#b9791c", shape: "diamond" },
    secondary: { color: "#8b93a0", shape: "square" },
};

export default {
    components: {
        Datetime,
    },

    data() {
        return {
            map: null,
            markers: {},
            tileErrorCount: 0,
            tilesUnavailable: false,
            pollTimer: null,
        };
    },

    computed: {
        mappedMonitors() {
            return Object.values(this.$root.monitorList || {}).filter(
                (m) => m.lat !== null && m.lat !== undefined && m.lng !== null && m.lng !== undefined
            );
        },
        unmappedCount() {
            return Object.values(this.$root.monitorList || {}).length - this.mappedMonitors.length;
        },

        statusList() {
            return this.$root.statusList || {};
        },

        lastHeartbeatList() {
            return this.$root.lastHeartbeatList || {};
        },

        // Severity-first: every monitor (mapped or not) that isn't healthy,
        // worst first. This is the home-screen "what's on fire" view - it
        // deliberately isn't scoped to only monitors with coordinates.
        attentionMonitors() {
            return Object.values(this.$root.monitorList || {})
                .filter((m) => SEVERITY_ORDER[this.statusList[m.id]?.color] !== undefined)
                .sort((a, b) => SEVERITY_ORDER[this.statusList[a.id]?.color] - SEVERITY_ORDER[this.statusList[b.id]?.color]);
        },

        healthyCount() {
            return Object.values(this.$root.monitorList || {}).length - this.attentionMonitors.length;
        },
    },

    watch: {
        "$root.monitorList": {
            deep: true,
            handler() {
                this.renderMarkers();
            },
        },
    },

    mounted() {
        this.initMap();
        this.pollTimer = setInterval(() => {
            this.$root.getMonitorList();
        }, POLL_INTERVAL_MS);
    },

    beforeUnmount() {
        clearInterval(this.pollTimer);
        if (this.map) {
            this.map.remove();
        }
    },

    methods: {
        initMap() {
            this.map = L.map("network-map").setView([ 20, 0 ], 2);

            const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: "&copy; OpenStreetMap contributors",
                maxZoom: 19,
            });

            tiles.on("tileerror", () => {
                this.tileErrorCount++;
                if (this.tileErrorCount >= TILE_ERROR_THRESHOLD) {
                    this.tilesUnavailable = true;
                }
            });
            tiles.on("tileload", () => {
                // A real load after errors means the outage was transient, not
                // a hard block - let the map recover instead of staying stuck.
                this.tileErrorCount = 0;
                this.tilesUnavailable = false;
            });

            tiles.addTo(this.map);
            this.renderMarkers();
        },

        statusClass(monitor) {
            const color = this.$root.statusList?.[monitor.id]?.color || "secondary";
            return { success: "up", danger: "down", warning: "pending", maintenance: "maintenance" }[color] || "pending";
        },

        markerIcon(monitor) {
            const color = this.$root.statusList?.[monitor.id]?.color || "secondary";
            const style = STATUS_STYLE[color] || STATUS_STYLE.secondary;
            return L.divIcon({
                className: "",
                html: `<div class="map-marker map-marker-${style.shape}" style="background:${style.color}"></div>`,
                iconSize: [ 16, 16 ],
            });
        },

        renderMarkers() {
            if (!this.map) {
                return;
            }

            const currentIds = new Set();
            for (const monitor of this.mappedMonitors) {
                currentIds.add(monitor.id);
                const icon = this.markerIcon(monitor);

                if (this.markers[monitor.id]) {
                    this.markers[monitor.id].setLatLng([ monitor.lat, monitor.lng ]);
                    this.markers[monitor.id].setIcon(icon);
                } else {
                    this.markers[monitor.id] = L.marker([ monitor.lat, monitor.lng ], { icon })
                        .addTo(this.map)
                        .bindPopup(monitor.name);
                }
            }

            for (const id of Object.keys(this.markers)) {
                if (!currentIds.has(Number(id))) {
                    this.map.removeLayer(this.markers[id]);
                    delete this.markers[id];
                }
            }
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../assets/vars";

.map-shell {
    display: flex;
    gap: 12px;
    align-items: flex-start;

    @media (max-width: 770px) {
        flex-direction: column;
    }
}

.map-main {
    flex: 1;
    min-width: 0;
}

#network-map {
    height: 70vh;
    min-height: 400px;
    padding: 0;
    overflow: hidden;

    // Free OpenStreetMap tiles are light-only; invert+rotate is the standard
    // no-dependency trick to make them fit a dark UI without a paid dark-tile
    // provider. Markers render outside the tile pane so they're unaffected.
    .dark & :deep(.leaflet-tile-pane) {
        filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.9);
    }
}

.severity-pane {
    width: 300px;
    flex: 0 0 300px;
    max-height: 70vh;
    overflow-y: auto;
    padding: 0;

    @media (max-width: 770px) {
        width: 100%;
        flex-basis: auto;
        max-height: none;
    }
}

.severity-header {
    font-family: $font-mono;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: $secondary-text;
    padding: 12px 14px 8px;
    border-bottom: 1px solid $card-border-color;

    .dark & {
        border-color: $dark-border-color;
    }
}

.severity-empty {
    padding: 14px;
    margin: 0;
    color: $secondary-text;
    font-size: 13px;
}

.severity-card {
    margin: 10px 12px 0;
    padding: 10px 12px;
    border-radius: $border-radius;
    border-left: 3px solid;

    &.severity-down {
        border-left-color: $danger;
        background: rgba($danger, 0.1);
    }

    &.severity-pending {
        border-left-color: $warning;
        background: rgba($warning, 0.1);
    }

    &.severity-maintenance {
        border-left-color: $maintenance;
        background: rgba($maintenance, 0.1);
    }
}

.severity-name {
    font-weight: 600;
    font-size: 13px;
}

.severity-meta {
    font-family: $font-mono;
    font-size: 11.5px;
    color: $secondary-text;
    margin-top: 4px;
}

.healthy-strip {
    margin: 14px 12px 14px;
    padding: 8px 12px;
    border-radius: $border-radius;
    background: rgba($secondary-text, 0.12);
    color: $secondary-text;
    font-family: $font-mono;
    font-size: 12px;
}

.dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-right: 8px;

    &.dot-up { background: $success; }
    &.dot-down { background: $danger; }
    &.dot-pending { background: $warning; }
    &.dot-maintenance { background: $maintenance; }
}

.tiles-unavailable {
    padding: 20px;

    ul {
        list-style: none;
        padding-left: 0;
    }
}
</style>

<style lang="scss">
// Unscoped: these render inside Leaflet's own DOM tree via divIcon, outside
// this component's scoped style boundary.
.map-marker {
    width: 16px;
    height: 16px;
    border: 2px solid white;
    box-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
}

.map-marker-circle {
    border-radius: 50%;
}

.map-marker-triangle {
    clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
}

.map-marker-square {
    border-radius: 2px;
}

.map-marker-diamond {
    transform: rotate(45deg);
}
</style>
