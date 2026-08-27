<template>
    <div>
        <div class="form-text mb-3">{{ $t("snmpDiscoveryDesc") }}</div>

        <form class="row g-3 align-items-end mb-4" @submit.prevent="startScan">
            <div class="col-md-4">
                <label for="scan-cidr" class="form-label">{{ $t("Subnet (CIDR)") }}</label>
                <input
                    id="scan-cidr"
                    v-model="form.cidr"
                    type="text"
                    class="form-control"
                    placeholder="192.168.1.0/24"
                    required
                    :disabled="scanning"
                />
            </div>
            <div class="col-md-2">
                <label for="scan-version" class="form-label">{{ $t("SNMP Version") }}</label>
                <select id="scan-version" v-model="form.version" class="form-select" :disabled="scanning">
                    <option value="1">SNMPv1</option>
                    <option value="2c">SNMPv2c</option>
                </select>
            </div>
            <div class="col-md-3">
                <label for="scan-community" class="form-label">{{ $t("Community String") }}</label>
                <HiddenInput id="scan-community" v-model="form.community" :disabled="scanning" placeholder="public" />
            </div>
            <div class="col-md-1">
                <label for="scan-port" class="form-label">{{ $t("Port") }}</label>
                <input
                    id="scan-port"
                    v-model.number="form.port"
                    type="number"
                    class="form-control"
                    :disabled="scanning"
                />
            </div>
            <div class="col-md-2">
                <button type="submit" class="btn btn-primary w-100" :disabled="scanning">
                    {{ scanning ? $t("Scanning") : $t("Scan") }}
                </button>
            </div>
        </form>

        <div v-if="scanning" class="mb-4">
            <div class="progress">
                <div
                    class="progress-bar"
                    :style="{ width: (progress.total ? (progress.done / progress.total) * 100 : 0) + '%' }"
                ></div>
            </div>
            <div class="form-text mt-1">{{ progress.done }} / {{ progress.total }}</div>
        </div>

        <div v-if="devices.length > 0">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <div>
                    <button class="btn btn-outline-normal btn-sm me-2" @click="selectAll(true)">
                        {{ $t("Select All") }}
                    </button>
                    <button class="btn btn-outline-normal btn-sm" @click="selectAll(false)">
                        {{ $t("Select None") }}
                    </button>
                </div>
                <button class="btn btn-primary" :disabled="importing || selectedCount === 0" @click="importSelected">
                    {{ importing ? $t("Importing") : $t("importSelectedCount", [selectedCount]) }}
                </button>
            </div>

            <table class="table">
                <thead>
                    <tr>
                        <th></th>
                        <th>{{ $t("IP") }}</th>
                        <th>{{ $t("Name") }}</th>
                        <th>{{ $t("Description") }}</th>
                        <th>{{ $t("LLDP Neighbors") }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="device in devices" :key="device.ip">
                        <td>
                            <input
                                v-model="device.selected"
                                type="checkbox"
                                class="form-check-input"
                                :disabled="device.alreadyMonitored"
                            />
                        </td>
                        <td class="mono">{{ device.ip }}</td>
                        <td>
                            {{ device.sysName || "-" }}
                            <span v-if="device.alreadyMonitored" class="badge bg-secondary ms-1">
                                {{ $t("alreadyMonitored") }}
                            </span>
                        </td>
                        <td class="text-truncate" style="max-width: 300px">{{ device.sysDescr }}</td>
                        <td>{{ device.lldpNeighbors.join(", ") || "-" }}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div v-else-if="scanCompleted" class="form-text">{{ $t("snmpDiscoveryNoDevices") }}</div>
    </div>
</template>

<script>
import HiddenInput from "../HiddenInput.vue";

export default {
    components: { HiddenInput },
    data() {
        return {
            form: {
                cidr: "",
                version: "2c",
                community: "",
                port: 161,
            },
            scanning: false,
            scanCompleted: false,
            progress: { done: 0, total: 0 },
            devices: [],
            importing: false,
        };
    },
    computed: {
        selectedCount() {
            return this.devices.filter((d) => d.selected).length;
        },
    },
    mounted() {
        this.$root.getSocket().on("snmpScanProgress", this.onScanProgress);
        this.$root.getSocket().on("snmpScanResult", this.onScanResult);
    },
    beforeUnmount() {
        this.$root.getSocket().off("snmpScanProgress", this.onScanProgress);
        this.$root.getSocket().off("snmpScanResult", this.onScanResult);
    },
    methods: {
        /**
         * Kick off a subnet scan on the server
         * @returns {void}
         */
        startScan() {
            this.devices = [];
            this.scanCompleted = false;
            this.scanning = true;
            this.progress = { done: 0, total: 0 };

            this.$root.getSocket().emit("scanSnmpSubnet", { ...this.form }, (res) => {
                if (!res.ok) {
                    this.scanning = false;
                    this.$root.toastError(res.msg);
                    return;
                }
                this.progress.total = res.total;
            });
        },

        /**
         * Update the progress bar as the server scans
         * @param {{done: number, total: number}} data Scan progress
         * @returns {void}
         */
        onScanProgress(data) {
            this.progress = data;
        },

        /**
         * Receive the final list of discovered devices
         * @param {Array<object>} devices Discovered devices
         * @returns {void}
         */
        onScanResult(devices) {
            this.scanning = false;
            this.scanCompleted = true;
            this.devices = devices.map((d) => ({ ...d, selected: !d.alreadyMonitored }));
        },

        /**
         * Select or deselect every importable (not already-monitored) device
         * @param {boolean} value Whether to select or deselect
         * @returns {void}
         */
        selectAll(value) {
            this.devices.forEach((d) => {
                if (!d.alreadyMonitored) {
                    d.selected = value;
                }
            });
        },

        /**
         * Create monitors for every selected device
         * @returns {void}
         */
        importSelected() {
            const selected = this.devices.filter((d) => d.selected);
            this.importing = true;

            this.$root.getSocket().emit(
                "bulkCreateSnmpMonitors",
                {
                    devices: selected,
                    community: this.form.community,
                    version: this.form.version,
                    port: this.form.port,
                },
                (res) => {
                    this.importing = false;
                    if (!res.ok) {
                        this.$root.toastError(res.msg);
                        return;
                    }
                    this.$root.toastSuccess(this.$t("importResultMsg", [res.created, res.skipped]));
                    if (res.errors.length > 0) {
                        console.error("Bulk SNMP import errors:", res.errors);
                    }
                    this.devices = this.devices.filter((d) => !d.selected);
                }
            );
        },
    },
};
</script>
