<template>
    <div>
        <h5 class="mb-3">{{ $t("Export Backup") }}</h5>
        <p class="form-text">
            {{ $t("backupDescription") }}
            {{ $t("backupDescription2") }}
        </p>
        <button class="btn btn-primary" @click="exportBackup">
            {{ $t("Export Backup") }}
        </button>
        <p class="form-text mt-2">
            <strong>{{ $t("backupDescription3") }}</strong>
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

export default {
    components: {
        Confirm,
    },

    data() {
        return {
            importHandle: "skip",
            selectedFile: null,
            importing: false,
        };
    },

    methods: {
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
