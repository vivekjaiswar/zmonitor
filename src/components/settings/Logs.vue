<template>
    <div>
        <div class="d-flex justify-content-between align-items-center mb-3">
            <div class="form-text mb-0">{{ $t("logsPageDesc") }}</div>
            <div class="btn-group">
                <button class="btn btn-normal" :disabled="loading" @click="load">
                    <font-awesome-icon icon="sync-alt" />
                    {{ $t("Refresh") }}
                </button>
                <button class="btn btn-normal" :disabled="downloading" @click="download">
                    <font-awesome-icon icon="download" />
                    {{ $t("Download Full Log") }}
                </button>
            </div>
        </div>

        <div v-if="lines.length === 0 && !loading" class="text-center my-3">
            {{ $t("No Logs Yet") }}
        </div>

        <pre v-else class="log-viewer">{{ lines.join("\n") }}</pre>
    </div>
</template>

<script>
export default {
    data() {
        return {
            lines: [],
            loading: false,
            downloading: false,
        };
    },

    mounted() {
        this.load();
    },

    methods: {
        /**
         * Fetch the most recent log lines from the server
         * @returns {void}
         */
        load() {
            this.loading = true;
            this.$root.getSocket().emit("getLogs", (res) => {
                this.loading = false;
                if (res.ok) {
                    this.lines = res.lines;
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        /**
         * Fetch the full raw log content and trigger a browser download
         * @returns {void}
         */
        download() {
            this.downloading = true;
            this.$root.getSocket().emit("downloadLogs", (res) => {
                this.downloading = false;
                if (!res.ok) {
                    this.$root.toastRes(res);
                    return;
                }

                const blob = new Blob([res.content], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const date = new Date().toISOString().slice(0, 10);
                const a = document.createElement("a");
                a.href = url;
                a.download = `zmonitor-logs-${date}.log`;
                a.click();
                URL.revokeObjectURL(url);
            });
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../../assets/vars.scss";

.log-viewer {
    background-color: $highlight-white;
    border-radius: 10px;
    padding: 15px;
    max-height: 65vh;
    overflow-y: auto;
    font-size: 0.8em;
    white-space: pre-wrap;
    word-break: break-all;
}

.dark .log-viewer {
    background-color: $dark-bg2;
}
</style>
