<template>
    <transition ref="tableContainer" name="slide-fade" appear>
        <div v-if="$route.name === 'DashboardHome'">
            <div class="d-flex align-items-baseline justify-content-between mb-3">
                <h1 class="mb-0">{{ $t("Dashboard") }}</h1>
                <div class="live-indicator"><span class="live-dot" />{{ $t("Live") }}</div>
            </div>

            <div class="stat-row mb-3">
                <StatCard :label="$t('Up')" :value="$root.stats.up" :status="$root.stats.up > 0 ? 'up' : 'neutral'" clickable @click="filterByStatus(1)" />
                <StatCard :label="$t('Down')" :value="$root.stats.down" :status="$root.stats.down > 0 ? 'down' : 'neutral'" clickable @click="filterByStatus(0)" />
                <StatCard :label="$t('Maintenance')" :value="$root.stats.maintenance" :status="$root.stats.maintenance > 0 ? 'warn' : 'neutral'" clickable @click="filterByStatus(3)" />
                <StatCard :label="$t('Unknown')" :value="$root.stats.unknown" status="neutral" />
                <StatCard :label="$t('pauseDashboardHome')" :value="$root.stats.pause" status="neutral" clickable @click="filterByActive(false)" />
            </div>

            <!-- Real, currently-computed fleet metrics - not a fabricated
                 historical trend line. A true trend graph needs a backend
                 aggregation query this pass doesn't add (see docs/isp-nms-frontend-redesign.md). -->
            <div v-if="hasAnyMonitor" class="stat-row mb-3">
                <StatCard :label="$t('Overall Uptime')" :value="overallUptimeLabel" :status="overallUptime >= 99 ? 'up' : 'warn'" />
                <StatCard :label="$t('Avg Response Time')" :value="avgResponseTimeLabel" status="neutral" />
            </div>

            <div class="shadow-box table-shadow-box table-wrapper">
                <div v-if="$root.isAdmin && importantHeartBeatListLength > 0" class="mb-3 text-end">
                    <button
                        class="btn btn-sm btn-outline-danger"
                        :disabled="clearingAllEvents"
                        @click="clearAllEventsDialog"
                    >
                        {{ $t("Clear All Events") }}
                    </button>
                </div>

                <div v-if="!hasAnyMonitor" class="empty-state">
                    <div class="empty-state-text">
                        <b>{{ $t("No monitors configured.") }}</b>
                        {{ $t("Add one to start tracking it.") }}
                    </div>
                    <router-link to="/add" class="btn btn-primary btn-sm">{{ $t("Add") }}</router-link>
                </div>

                <table v-else class="table table-borderless table-hover">
                    <thead>
                        <tr>
                            <th v-if="showGroupColumn">{{ $t("Group Name") }}</th>
                            <th class="name-column">{{ $t("Name") }}</th>
                            <th>{{ $t("Status") }}</th>
                            <th>{{ $t("DateTime") }}</th>
                            <th>{{ $t("Message") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="(beat, index) in displayedRecords"
                            :key="index"
                            :class="{ 'shadow-box': $root.windowWidth <= 550 }"
                        >
                            <td v-if="showGroupColumn">
                                <router-link
                                    v-if="getGroupName(beat.monitorID)"
                                    :to="`/dashboard/${getGroupId(beat.monitorID)}`"
                                >
                                    {{ getGroupName(beat.monitorID) }}
                                </router-link>
                                <span v-else class="text-secondary">—</span>
                            </td>
                            <td class="name-column">
                                <router-link :to="`/dashboard/${beat.monitorID}`">
                                    {{ $root.monitorList[beat.monitorID]?.name }}
                                </router-link>
                            </td>
                            <td><Status :status="beat.status" /></td>
                            <td :class="{ 'border-0': !beat.msg }"><Datetime :value="beat.time" /></td>
                            <td class="border-0">{{ beat.msg }}</td>
                        </tr>

                        <tr v-if="importantHeartBeatListLength === 0">
                            <td :colspan="tableColumnCount">
                                {{ $t("No important events") }}
                            </td>
                        </tr>
                    </tbody>
                </table>

                <div class="d-flex justify-content-center kuma_pagination">
                    <pagination
                        v-model="page"
                        :records="importantHeartBeatListLength"
                        :per-page="perPage"
                        :options="paginationConfig"
                    />
                </div>
            </div>
        </div>
    </transition>
    <Confirm
        ref="confirmClearEvents"
        btn-style="btn-danger"
        :yes-text="$t('Yes')"
        :no-text="$t('No')"
        @yes="clearAllEvents"
    >
        {{ $t("clearAllEventsMsg") }}
    </Confirm>
    <router-view ref="child" />
</template>

<script>
import Status from "../components/Status.vue";
import Datetime from "../components/Datetime.vue";
import Pagination from "v-pagination-3";
import Confirm from "../components/Confirm.vue";
import StatCard from "../components/StatCard.vue";

export default {
    components: {
        Datetime,
        Status,
        Pagination,
        Confirm,
        StatCard,
    },
    props: {
        calculatedHeight: {
            type: Number,
            default: 0,
        },
    },
    data() {
        return {
            page: 1,
            perPage: 25,
            initialPerPage: 25,
            paginationConfig: {
                hideCount: true,
                chunksNavigation: "scroll",
            },
            importantHeartBeatListLength: 0,
            displayedRecords: [],
            clearingAllEvents: false,
        };
    },
    computed: {
        showGroupColumn() {
            return Object.values(this.$root.monitorList).some((m) => m.parent != null);
        },
        tableColumnCount() {
            return this.showGroupColumn ? 5 : 4;
        },
        hasAnyMonitor() {
            return Object.keys(this.$root.monitorList).length > 0;
        },

        /**
         * Real, current-snapshot uptime percentage across non-paused
         * monitors (up / active). Not a historical trend - see the
         * template comment for why.
         * @returns {number|null} Percentage 0-100, or null if no active monitors
         */
        overallUptime() {
            const { up, active } = this.$root.stats;
            if (!active) {
                return null;
            }
            return (up / active) * 100;
        },
        overallUptimeLabel() {
            return this.overallUptime === null ? "—" : `${this.overallUptime.toFixed(1)}%`;
        },

        /**
         * Real average of each monitor's already-fetched avgPing value.
         * @returns {number|null} Average response time in ms, or null if no data yet
         */
        avgResponseTime() {
            const values = Object.values(this.$root.avgPingList).filter((v) => typeof v === "number");
            if (values.length === 0) {
                return null;
            }
            return values.reduce((sum, v) => sum + v, 0) / values.length;
        },
        avgResponseTimeLabel() {
            return this.avgResponseTime === null ? "—" : `${Math.round(this.avgResponseTime)}ms`;
        },
    },
    watch: {
        perPage() {
            this.$nextTick(() => {
                this.getImportantHeartbeatListPaged();
            });
        },

        page() {
            this.getImportantHeartbeatListPaged();
        },
    },

    mounted() {
        this.getImportantHeartbeatListLength();

        this.$root.emitter.on("newImportantHeartbeat", this.onNewImportantHeartbeat);

        this.initialPerPage = this.perPage;

        window.addEventListener("resize", this.updatePerPage);
        this.updatePerPage();
    },

    beforeUnmount() {
        this.$root.emitter.off("newImportantHeartbeat", this.onNewImportantHeartbeat);

        window.removeEventListener("resize", this.updatePerPage);
    },

    methods: {
        /**
         * Request the monitor list sidebar to filter by heartbeat status.
         * @param {number} status Status code (0=down, 1=up, 2=pending, 3=maintenance)
         * @returns {void}
         */
        filterByStatus(status) {
            this.$root.dashboardFilterRequest = { status: [status], active: null, tags: null };
        },

        /**
         * Request the monitor list sidebar to filter by active/paused state.
         * @param {boolean} active True for running monitors, false for paused
         * @returns {void}
         */
        filterByActive(active) {
            this.$root.dashboardFilterRequest = { status: null, active: [active], tags: null };
        },

        /**
         * Returns the group (parent) name for a monitor, or empty string if none.
         * @param {number} monitorID - The monitor ID.
         * @returns {string} The group name or empty string.
         */
        getGroupName(monitorID) {
            const monitor = this.$root.monitorList[monitorID];
            if (!monitor || monitor.parent == null) {
                return "";
            }
            const parent = this.$root.monitorList[monitor.parent];
            return parent ? parent.name : "";
        },

        /**
         * Returns the group (parent) ID for a monitor, or null if none.
         * @param {number} monitorID - The monitor ID.
         * @returns {number|null} The group monitor ID or null.
         */
        getGroupId(monitorID) {
            const monitor = this.$root.monitorList[monitorID];
            return monitor && monitor.parent != null ? monitor.parent : null;
        },

        /**
         * Updates the displayed records when a new important heartbeat arrives.
         * @param {object} heartbeat - The heartbeat object received.
         * @returns {void}
         */
        onNewImportantHeartbeat(heartbeat) {
            if (this.page === 1) {
                this.displayedRecords.unshift(heartbeat);
                if (this.displayedRecords.length > this.perPage) {
                    this.displayedRecords.pop();
                }
                this.importantHeartBeatListLength += 1;
            }
        },

        /**
         * Retrieves the length of the important heartbeat list for all monitors.
         * @returns {void}
         */
        getImportantHeartbeatListLength() {
            this.$root.getSocket().emit("monitorImportantHeartbeatListCount", null, (res) => {
                if (res.ok) {
                    this.importantHeartBeatListLength = res.count;
                    this.getImportantHeartbeatListPaged();
                }
            });
        },

        /**
         * Retrieves the important heartbeat list for the current page.
         * @returns {void}
         */
        getImportantHeartbeatListPaged() {
            const offset = (this.page - 1) * this.perPage;
            this.$root.getSocket().emit("monitorImportantHeartbeatListPaged", null, offset, this.perPage, (res) => {
                if (res.ok) {
                    this.displayedRecords = res.data;
                }
            });
        },

        /**
         * Updates the number of items shown per page based on the available height.
         * @returns {void}
         */
        updatePerPage() {
            const tableContainer = this.$refs.tableContainer;
            const tableContainerHeight = tableContainer.offsetHeight;
            const availableHeight = window.innerHeight - tableContainerHeight;
            const additionalPerPage = Math.floor(availableHeight / 58);

            if (additionalPerPage > 0) {
                this.perPage = Math.max(this.initialPerPage, this.perPage + additionalPerPage);
            } else {
                this.perPage = this.initialPerPage;
            }
        },

        clearAllEventsDialog() {
            this.$refs.confirmClearEvents.show();
        },
        clearAllEvents() {
            this.clearingAllEvents = true;
            const monitorIDs = Object.keys(this.$root.monitorList);
            let failed = 0;
            const total = monitorIDs.length;

            if (total === 0) {
                this.clearingAllEvents = false;
                this.$root.toastError(this.$t("No monitors found"));
                return;
            }

            monitorIDs.forEach((monitorID) => {
                this.$root.getSocket().emit("clearEvents", monitorID, (res) => {
                    if (!res || !res.ok) {
                        failed++;
                    }
                });
            });
            this.clearingAllEvents = false;
            this.page = 1;
            this.getImportantHeartbeatListLength();
            if (failed === 0) {
                this.$root.toastSuccess(this.$t("Events cleared successfully"));
            } else {
                this.$root.toastError(
                    this.$t("Could not clear events", {
                        failed,
                        total,
                    })
                );
            }
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../assets/vars";

.stat-row {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;

    @media (max-width: 650px) {
        grid-template-columns: repeat(2, 1fr);
    }
}

.live-indicator {
    font-size: 11px;
    color: $secondary-text;
    display: flex;
    align-items: center;
    gap: 6px;

    .dark & {
        color: $dark-font-color;
    }
}

.live-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: $success;
    display: inline-block;
}

.empty-state {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 20px;
    flex-wrap: wrap;
}

.empty-state-text {
    flex: 1;
    font-size: 13px;
    color: $secondary-text;

    .dark & {
        color: $dark-font-color;
    }
}

.shadow-box {
    padding: 20px;
}

table {
    font-size: 14px;

    tr {
        transition: all ease-in-out 0.2ms;
    }

    @media (max-width: 550px) {
        table-layout: fixed;
        overflow-wrap: break-word;
    }
}

@media screen and (max-width: 1280px) {
    .name-column {
        min-width: 150px;
    }
}

@media screen and (min-aspect-ratio: 4/3) {
    .name-column {
        min-width: 200px;
    }
}

.table-wrapper {
    overflow-x: auto;
}
</style>
