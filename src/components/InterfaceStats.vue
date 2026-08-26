<template>
    <div class="interface-stats">
        <div v-if="loading" class="text-center py-3">{{ $t("Loading") }}...</div>
        <div v-else-if="interfaces.length === 0" class="text-center py-3 form-text">
            {{ $t("noInterfaceDataYet") }}
        </div>
        <div v-for="iface in interfaces" :key="iface.id" class="interface-row">
            <div class="interface-header">
                <span class="interface-name">{{ iface.if_name }}</span>
                <span class="badge" :class="iface.if_oper_status === 'up' ? 'bg-primary' : 'bg-secondary'">
                    {{ iface.if_oper_status }}
                </span>
                <span v-if="iface.if_speed" class="form-text interface-speed">
                    {{ formatBps(iface.if_speed) }}
                </span>
            </div>
            <div v-if="iface.samples.length > 0" class="chart-wrapper">
                <Line :data="chartData(iface)" :options="chartOptions" />
            </div>
            <div v-else class="form-text py-2">{{ $t("noInterfaceDataYet") }}</div>
        </div>
    </div>
</template>

<script lang="js">
import { LineController, LineElement, PointElement, LinearScale, TimeScale, Tooltip, Legend, Chart, Filler } from "chart.js";
import "chartjs-adapter-dayjs-4";
import { Line } from "vue-chartjs";

Chart.register(LineController, LineElement, PointElement, LinearScale, TimeScale, Tooltip, Filler, Legend);

/**
 * Format a bits-per-second value into a human-readable string
 * @param {number} bps Bits per second
 * @returns {string} Formatted value, e.g. "12.3 Mbps"
 */
function formatBps(bps) {
    if (!bps || bps <= 0) {
        return "0 bps";
    }
    const units = ["bps", "Kbps", "Mbps", "Gbps"];
    let value = bps;
    let unitIndex = 0;
    while (value >= 1000 && unitIndex < units.length - 1) {
        value /= 1000;
        unitIndex++;
    }
    return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export default {
    components: { Line },
    props: {
        /** ID of monitor */
        monitorId: {
            type: Number,
            required: true,
        },
    },
    data() {
        return {
            loading: true,
            interfaces: [],
            chartOptions: {
                normalized: true,
                animation: false,
                responsive: true,
                interaction: { mode: "nearest", axis: "x", intersect: false },
                scales: {
                    x: { type: "time", time: { tooltipFormat: "YYYY-MM-DD HH:mm:ss" }, ticks: { maxRotation: 0 } },
                    y: {
                        ticks: { callback: (value) => formatBps(value) },
                    },
                },
                plugins: {
                    tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatBps(ctx.parsed.y)}` } },
                },
            },
        };
    },
    mounted() {
        this.loadStats();
    },
    methods: {
        formatBps,

        /**
         * Load interface list + recent samples from the server
         * @returns {void}
         */
        loadStats() {
            this.loading = true;
            this.$root.getSocket().emit("getMonitorInterfaceStats", this.monitorId, 24, (res) => {
                this.loading = false;
                if (res.ok) {
                    this.interfaces = res.data;
                } else {
                    this.$root.toastError(res.msg);
                }
            });
        },

        /**
         * Build Chart.js dataset config for one interface's in/out bandwidth
         * @param {object} iface Interface row with a `samples` array
         * @returns {object} Chart.js data object
         */
        chartData(iface) {
            return {
                datasets: [
                    {
                        label: this.$t("In"),
                        data: iface.samples.map((s) => ({ x: s.timestamp * 1000, y: s.in_bps })),
                        borderColor: "#3fb950",
                        backgroundColor: "rgba(63, 185, 80, 0.15)",
                        fill: true,
                        pointRadius: 0,
                        borderWidth: 1.5,
                    },
                    {
                        label: this.$t("Out"),
                        data: iface.samples.map((s) => ({ x: s.timestamp * 1000, y: s.out_bps })),
                        borderColor: "#3b82c4",
                        backgroundColor: "rgba(59, 130, 196, 0.15)",
                        fill: true,
                        pointRadius: 0,
                        borderWidth: 1.5,
                    },
                ],
            };
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../assets/vars.scss";

.interface-stats {
    font-family: $font-sans, sans-serif;
}

.interface-row {
    text-align: left;
    padding: 1rem 0;
    border-bottom: 1px solid var(--border-color, rgba(0, 0, 0, 0.1));

    &:last-child {
        border-bottom: none;
    }
}

.interface-header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.5rem;

    .interface-name {
        font-weight: 600;
    }

    .interface-speed {
        margin-left: auto;
        font-family: $font-mono, monospace;
    }
}

.chart-wrapper {
    position: relative;
    height: 180px;
}
</style>
