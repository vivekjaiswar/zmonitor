<template>
    <div>
        <h5 class="mb-3">{{ $t("Export Backup") }}</h5>
        <p class="form-text">
            {{ $t("backupDescription") }}
            {{ $t("backupDescription2") }}
        </p>
        <button class="btn btn-primary me-2" @click="exportBackup">
            {{ $t("Export Backup") }}
        </button>
        <button class="btn btn-normal" @click="exportCsv">
            {{ $t("Export CSV") }}
        </button>
        <p class="form-text mt-2">
            <strong>{{ $t("backupDescription3") }}</strong>
        </p>

        <h5 class="mt-5 mb-3">{{ $t("Import Monitors from CSV") }}</h5>
        <p class="form-text">
            {{ $t("importCsvDescription") }}
        </p>

        <div class="mb-3">
            <label for="csv-monitor-type" class="form-label">{{ $t("Monitor Type") }}</label>
            <select id="csv-monitor-type" v-model="csvMonitorType" class="form-select">
                <option value="ping">Ping</option>
                <option value="port">TCP Port</option>
                <option value="http">HTTP(s)</option>
            </select>
        </div>

        <div v-if="csvMonitorType === 'port'" class="mb-3">
            <label for="csv-port" class="form-label">{{ $t("Port") }}</label>
            <input id="csv-port" v-model.number="csvPort" type="number" class="form-control" min="1" max="65535" />
        </div>

        <div class="mb-3">
            <input
                ref="csvFileInput"
                class="form-control"
                type="file"
                accept=".csv,text/csv"
                @change="onCsvFileChange"
            />
        </div>

        <button class="btn btn-primary" :disabled="!csvSelectedFile || csvImporting" @click="importCsv">
            {{ $t("Import CSV") }}
        </button>

        <p v-if="csvImporting" class="form-text mt-2">
            {{ $t("csvImportProgress", { done: csvImportDone, total: csvImportTotal }) }}
        </p>

        <h5 class="mt-5 mb-3">{{ $t("Import Coordinates from CSV") }}</h5>
        <p class="form-text">
            {{ $t("importCoordsCsvDescription") }}
        </p>

        <div class="mb-3">
            <input
                ref="coordsCsvFileInput"
                class="form-control"
                type="file"
                accept=".csv,text/csv"
                @change="onCoordsCsvFileChange"
            />
        </div>

        <button class="btn btn-primary" :disabled="!coordsCsvSelectedFile || coordsCsvImporting" @click="importCoordsCsv">
            {{ $t("Import Coordinates") }}
        </button>

        <p v-if="coordsCsvImporting" class="form-text mt-2">
            {{ $t("csvImportProgress", { done: coordsCsvImportDone, total: coordsCsvImportTotal }) }}
        </p>

        <div v-if="coordsCsvSkipped.length" class="form-text mt-2 text-warning">
            <strong>{{ $t("coordsCsvSkippedTitle", { count: coordsCsvSkipped.length }) }}</strong>
            <ul class="mb-0">
                <li v-for="(row, i) in coordsCsvSkipped" :key="i">{{ row }}</li>
            </ul>
        </div>

        <h5 class="mt-5 mb-3">{{ $t("autoLocateAllTitle") }}</h5>
        <p class="form-text">
            {{ $t("autoLocateAllDescription", { count: monitorsMissingCoords }) }}
        </p>

        <button
            class="btn btn-primary"
            :disabled="autoLocatingAll || monitorsMissingCoords === 0"
            @click="autoLocateAll"
        >
            {{ $t("autoLocateAllButton") }}
        </button>

        <p v-if="autoLocatingAll" class="form-text mt-2">
            {{ $t("csvImportProgress", { done: autoLocateAllDone, total: autoLocateAllTotal }) }}
        </p>

        <h5 class="mt-5 mb-3">{{ $t("Import Backup") }}</h5>
        <p class="form-text">
            {{ $t("importBackupDescription") }}
        </p>

        <div class="mb-3">
            <div class="form-check">
                <input
                    id="import-keep"
                    v-model="importHandle"
                    class="form-check-input"
                    type="radio"
                    value="keep"
                />
                <label class="form-check-label" for="import-keep">{{ $t("Keep both") }}</label>
            </div>
            <div class="form-check">
                <input
                    id="import-skip"
                    v-model="importHandle"
                    class="form-check-input"
                    type="radio"
                    value="skip"
                />
                <label class="form-check-label" for="import-skip">{{ $t("Skip existing") }}</label>
            </div>
            <div class="form-check">
                <input
                    id="import-overwrite"
                    v-model="importHandle"
                    class="form-check-input"
                    type="radio"
                    value="overwrite"
                />
                <label class="form-check-label" for="import-overwrite">{{ $t("Overwrite") }}</label>
            </div>
            <div class="form-text">
                {{ $t("importHandleDescription") }}
            </div>
        </div>

        <div class="mb-3">
            <input ref="fileInput" class="form-control" type="file" accept="application/json" @change="onFileChange" />
        </div>

        <button class="btn btn-primary" :disabled="!selectedFile || importing" @click="confirmImport">
            {{ $t("Import Backup") }}
        </button>

        <Confirm ref="confirmImport" :yes-text="$t('Yes')" :no-text="$t('No')" @yes="importBackup">
            {{ $t("confirmImportMsg") }}
        </Confirm>
    </div>
</template>

<script>
import Confirm from "../../components/Confirm.vue";
import { findMonitorMatch } from "../../util-csv-match";

/**
 * Escape a value for inclusion in a CSV cell (RFC4180-ish): wrap in quotes
 * and double up any embedded quotes if the value contains a comma, quote,
 * or newline.
 * @param {*} value Value to escape
 * @returns {string} CSV-safe cell content
 */
function csvEscape(value) {
    const str = String(value ?? "");
    if (/["\n,]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/**
 * Minimal RFC4180-ish CSV parser: handles quoted fields with embedded
 * commas/newlines/escaped quotes, and both \n and \r\n line endings.
 * @param {string} text Raw CSV file content
 * @returns {Array<Array<string>>} Rows of cell values
 */
function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (inQuotes) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    cell += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                cell += char;
            }
        } else if (char === '"') {
            inQuotes = true;
        } else if (char === ",") {
            row.push(cell);
            cell = "";
        } else if (char === "\n" || char === "\r") {
            if (char === "\r" && text[i + 1] === "\n") {
                i++;
            }
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
        } else {
            cell += char;
        }
    }

    if (cell !== "" || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }

    return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export default {
    components: {
        Confirm,
    },

    data() {
        return {
            importHandle: "skip",
            selectedFile: null,
            importing: false,

            csvMonitorType: "ping",
            csvPort: 80,
            csvSelectedFile: null,
            csvImporting: false,
            csvImportDone: 0,
            csvImportTotal: 0,

            coordsCsvSelectedFile: null,
            coordsCsvImporting: false,
            coordsCsvImportDone: 0,
            coordsCsvImportTotal: 0,
            coordsCsvSkipped: [],

            autoLocatingAll: false,
            autoLocateAllDone: 0,
            autoLocateAllTotal: 0,
        };
    },

    computed: {
        monitorsMissingCoords() {
            return Object.values(this.$root.monitorList || {}).filter(
                (m) => m.lat === null || m.lat === undefined
            ).length;
        },
    },

    methods: {
        /**
         * Build a CSV file (sr_no, name, description, ip_address, location)
         * from the currently loaded monitor list and trigger a browser download.
         * @returns {void}
         */
        exportCsv() {
            const header = ["sr_no", "name", "description", "ip_address", "location", "lat", "lng"];
            const monitors = Object.values(this.$root.monitorList || {});

            const rows = monitors.map((monitor, index) => [
                index + 1,
                monitor.name || "",
                monitor.description || "",
                monitor.hostname || "",
                (monitor.tags && monitor.tags[0] && monitor.tags[0].name) || "",
                monitor.lat ?? "",
                monitor.lng ?? "",
            ]);

            const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");

            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            const date = new Date().toISOString().slice(0, 10);
            a.href = url;
            a.download = `zmonitor-monitors-${date}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        },

        /**
         * Track the selected CSV file for import
         * @param {Event} event Change event from the file input
         * @returns {void}
         */
        onCsvFileChange(event) {
            this.csvSelectedFile = event.target.files[0] || null;
        },

        /**
         * Parse the selected CSV file and create one monitor per row, tagging
         * each with its location (creating the tag if it doesn't exist yet).
         * @returns {void}
         */
        importCsv() {
            if (!this.csvSelectedFile) {
                return;
            }

            const reader = new FileReader();
            reader.onload = async () => {
                const rows = parseCsv(reader.result);
                if (rows.length === 0) {
                    this.$root.toastError(this.$t("csvEmptyFile"));
                    return;
                }

                // First row is the header; map remaining rows by column name.
                const header = rows[0].map((col) => col.trim().toLowerCase());
                const nameIdx = header.indexOf("name");
                const descIdx = header.indexOf("description");
                const ipIdx = header.indexOf("ip_address");
                const locationIdx = header.indexOf("location");
                const latIdx = header.indexOf("lat");
                const lngIdx = header.indexOf("lng");

                if (nameIdx === -1 || ipIdx === -1) {
                    this.$root.toastError(this.$t("csvMissingColumns"));
                    return;
                }

                const dataRows = rows.slice(1).filter((row) => row.some((cell) => cell.trim() !== ""));

                this.csvImporting = true;
                this.csvImportDone = 0;
                this.csvImportTotal = dataRows.length;

                const tagIDByLocation = {};
                let failed = 0;

                for (const row of dataRows) {
                    const name = row[nameIdx]?.trim() || "";
                    const description = descIdx !== -1 ? row[descIdx]?.trim() || "" : "";
                    const ipAddress = row[ipIdx]?.trim() || "";
                    const location = locationIdx !== -1 ? row[locationIdx]?.trim() || "" : "";
                    const lat = latIdx !== -1 && row[latIdx]?.trim() ? parseFloat(row[latIdx]) : null;
                    const lng = lngIdx !== -1 && row[lngIdx]?.trim() ? parseFloat(row[lngIdx]) : null;

                    const monitorPayload = this.buildMonitorPayload(name, description, ipAddress);
                    if (!Number.isNaN(lat) && !Number.isNaN(lng) && lat !== null && lng !== null) {
                        monitorPayload.lat = lat;
                        monitorPayload.lng = lng;
                    }
                    const addRes = await this.addMonitorAsync(monitorPayload);

                    if (!addRes.ok) {
                        failed++;
                    } else if (location) {
                        const tagID = await this.resolveTagID(location, tagIDByLocation);
                        if (tagID) {
                            await this.addMonitorTagAsync(tagID, addRes.monitorID);
                        }
                    }

                    this.csvImportDone++;
                }

                this.csvImporting = false;
                this.csvSelectedFile = null;
                this.$refs.csvFileInput.value = "";
                this.$root.getMonitorList();

                if (failed === 0) {
                    this.$root.toastSuccess(this.$t("csvImportSuccess", { count: dataRows.length }));
                } else {
                    this.$root.toastError(this.$t("csvImportPartialFailure", { failed, total: dataRows.length }));
                }
            };
            reader.onerror = () => {
                this.$root.toastError(this.$t("Failed to read the file."));
            };
            reader.readAsText(this.csvSelectedFile);
        },

        /**
         * Track the selected coordinates CSV file for import
         * @param {Event} event Change event from the file input
         * @returns {void}
         */
        onCoordsCsvFileChange(event) {
            this.coordsCsvSelectedFile = event.target.files[0] || null;
        },

        /**
         * Parse the selected CSV file (name/hostname + lat + lng columns) and
         * set coordinates on existing monitors by matching each row. Insert-only
         * "Import Monitors from CSV" above is a separate flow - this one only
         * ever updates monitors that already exist.
         * @returns {void}
         */
        importCoordsCsv() {
            if (!this.coordsCsvSelectedFile) {
                return;
            }

            const reader = new FileReader();
            reader.onload = async () => {
                const rows = parseCsv(reader.result);
                if (rows.length === 0) {
                    this.$root.toastError(this.$t("csvEmptyFile"));
                    return;
                }

                const header = rows[0].map((col) => col.trim().toLowerCase());
                const nameIdx = header.indexOf("name");
                const hostnameIdx = header.indexOf("hostname");
                const latIdx = header.indexOf("lat");
                const lngIdx = header.indexOf("lng");

                if (latIdx === -1 || lngIdx === -1 || (nameIdx === -1 && hostnameIdx === -1)) {
                    this.$root.toastError(this.$t("coordsCsvMissingColumns"));
                    return;
                }

                const dataRows = rows.slice(1).filter((row) => row.some((cell) => cell.trim() !== ""));

                this.coordsCsvImporting = true;
                this.coordsCsvImportDone = 0;
                this.coordsCsvImportTotal = dataRows.length;
                this.coordsCsvSkipped = [];

                let updated = 0;

                for (const row of dataRows) {
                    const name = nameIdx !== -1 ? row[nameIdx]?.trim() || "" : "";
                    const hostname = hostnameIdx !== -1 ? row[hostnameIdx]?.trim() || "" : "";
                    const lat = parseFloat(row[latIdx]);
                    const lng = parseFloat(row[lngIdx]);

                    const rowLabel = name || hostname || `row ${this.coordsCsvImportDone + 1}`;

                    if (Number.isNaN(lat) || Number.isNaN(lng)) {
                        this.coordsCsvSkipped.push(this.$t("coordsCsvSkippedInvalid", { row: rowLabel }));
                        this.coordsCsvImportDone++;
                        continue;
                    }

                    const monitors = Object.values(this.$root.monitorList || {});
                    const match = findMonitorMatch(monitors, hostname, name);
                    if (!match) {
                        this.coordsCsvSkipped.push(this.$t("coordsCsvSkippedNoMatch", { row: rowLabel }));
                        this.coordsCsvImportDone++;
                        continue;
                    }

                    const res = await new Promise((resolve) => {
                        this.$root.getSocket().emit("setMonitorLatLng", { id: match.id, lat, lng }, resolve);
                    });

                    if (res.ok) {
                        updated++;
                    } else {
                        this.coordsCsvSkipped.push(this.$t("coordsCsvSkippedFailed", { row: rowLabel, msg: res.msg }));
                    }

                    this.coordsCsvImportDone++;
                }

                this.coordsCsvImporting = false;
                this.coordsCsvSelectedFile = null;
                this.$refs.coordsCsvFileInput.value = "";
                this.$root.getMonitorList();

                if (this.coordsCsvSkipped.length === 0) {
                    this.$root.toastSuccess(this.$t("coordsCsvImportSuccess", { count: updated }));
                } else {
                    this.$root.toastError(this.$t("coordsCsvImportPartialFailure", { updated, skipped: this.coordsCsvSkipped.length }));
                }
            };
            reader.onerror = () => {
                this.$root.toastError(this.$t("Failed to read the file."));
            };
            reader.readAsText(this.coordsCsvSelectedFile);
        },

        /**
         * Back-fill coordinates for every monitor that doesn't have any yet,
         * by looking up each one's hostname/IP. Paced with a delay between
         * lookups to stay under the free geolocation API's rate limit.
         * @returns {Promise<void>}
         */
        async autoLocateAll() {
            const targets = Object.values(this.$root.monitorList || {}).filter(
                (m) => m.lat === null || m.lat === undefined
            );
            if (targets.length === 0) {
                return;
            }

            this.autoLocatingAll = true;
            this.autoLocateAllDone = 0;
            this.autoLocateAllTotal = targets.length;

            let found = 0;

            for (const monitor of targets) {
                const res = await new Promise((resolve) => {
                    this.$root.getSocket().emit("autoLocateMonitor", monitor.id, resolve);
                });

                if (res.ok && res.found) {
                    found++;
                }

                this.autoLocateAllDone++;

                if (this.autoLocateAllDone < targets.length) {
                    await new Promise((resolve) => setTimeout(resolve, 1500));
                }
            }

            this.autoLocatingAll = false;
            this.$root.getMonitorList();
            this.$root.toastSuccess(
                this.$t("autoLocateAllResult", { found, total: targets.length })
            );
        },

        /**
         * Build the minimal monitor payload for the selected CSV import type
         * @param {string} name Monitor name
         * @param {string} description Monitor description
         * @param {string} ipAddress Host/IP to check
         * @returns {object} Payload for the "add" socket event
         */
        buildMonitorPayload(name, description, ipAddress) {
            const base = {
                name,
                description,
                interval: 60,
                retryInterval: 60,
                resendInterval: 0,
                maxretries: 0,
                notificationIDList: {},
                accepted_statuscodes: ["200-299"],
                conditions: [],
            };

            if (this.csvMonitorType === "http") {
                return { ...base, type: "http", url: `http://${ipAddress}` };
            }

            if (this.csvMonitorType === "port") {
                return { ...base, type: "port", hostname: ipAddress, port: this.csvPort };
            }

            return { ...base, type: "ping", hostname: ipAddress };
        },

        /**
         * Create a monitor via the "add" socket event
         * @param {object} payload Monitor payload
         * @returns {Promise<object>} Server response
         */
        addMonitorAsync(payload) {
            return new Promise((resolve) => {
                this.$root.getSocket().emit("add", payload, resolve);
            });
        },

        /**
         * Resolve a location name to a tag ID, creating the tag if it doesn't
         * already exist. Caches results across rows sharing the same location.
         * @param {string} location Location/tag name
         * @param {object} cache Map of location name -> tag ID, mutated in place
         * @returns {Promise<number|null>} Tag ID, or null on failure
         */
        async resolveTagID(location, cache) {
            if (cache[location]) {
                return cache[location];
            }

            const existing = await new Promise((resolve) => {
                this.$root.getSocket().emit("getTags", resolve);
            });
            const found = existing.ok && existing.tags.find((tag) => tag.name === location);
            if (found) {
                cache[location] = found.id;
                return found.id;
            }

            const created = await new Promise((resolve) => {
                this.$root.getSocket().emit("addTag", { name: location, color: "#4B5563" }, resolve);
            });
            if (created.ok) {
                cache[location] = created.tag.id;
                return created.tag.id;
            }

            return null;
        },

        /**
         * Apply a tag to a monitor via the "addMonitorTag" socket event
         * @param {number} tagID Tag ID
         * @param {number} monitorID Monitor ID
         * @returns {Promise<object>} Server response
         */
        addMonitorTagAsync(tagID, monitorID) {
            return new Promise((resolve) => {
                this.$root.getSocket().emit("addMonitorTag", tagID, monitorID, "", resolve);
            });
        },

        /**
         * Build a backup file from the currently loaded monitors and
         * notifications, and trigger a browser download.
         * @returns {void}
         */
        exportBackup() {
            const backup = {
                version: (this.$root.info && this.$root.info.version) || "unknown",
                notificationList: Object.values(this.$root.notificationList || {}),
                monitorList: Object.values(this.$root.monitorList || {}),
            };

            const blob = new Blob([JSON.stringify(backup, null, 4)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            const date = new Date().toISOString().slice(0, 10);
            a.href = url;
            a.download = `zmonitor-backup-${date}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        },

        /**
         * Track the selected file for import
         * @param {Event} event Change event from the file input
         * @returns {void}
         */
        onFileChange(event) {
            this.selectedFile = event.target.files[0] || null;
        },

        /**
         * Show the confirmation dialog before importing
         * @returns {void}
         */
        confirmImport() {
            this.$refs.confirmImport.show();
        },

        /**
         * Read the selected file and upload it for import
         * @returns {void}
         */
        importBackup() {
            if (!this.selectedFile) {
                return;
            }

            this.importing = true;
            const reader = new FileReader();
            reader.onload = () => {
                this.$root.uploadBackup(reader.result, this.importHandle, (res) => {
                    this.importing = false;
                    this.$root.toastRes(res);
                    if (res.ok) {
                        this.selectedFile = null;
                        this.$refs.fileInput.value = "";
                    }
                });
            };
            reader.onerror = () => {
                this.importing = false;
                this.$root.toastError(this.$t("Failed to read the file."));
            };
            reader.readAsText(this.selectedFile);
        },
    },
};
</script>
