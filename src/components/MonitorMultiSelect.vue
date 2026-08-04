<template>
    <div class="monitor-multi-select">
        <div class="filter-row mb-2">
            <div class="search-wrapper">
                <a v-if="searchText != ''" class="search-icon" @click="searchText = ''">
                    <font-awesome-icon icon="times" />
                </a>
                <form @submit.prevent>
                    <input
                        v-model="searchText"
                        class="form-control search-input"
                        :placeholder="$t('Search...')"
                        autocomplete="off"
                    />
                </form>
            </div>

            <div class="filters-group">
                <input
                    v-model="allVisibleSelected"
                    class="form-check-input"
                    type="checkbox"
                    :aria-label="$t('selectAllMonitorsAria')"
                    :disabled="filteredList.length === 0"
                />
                <MonitorListFilter :filterState="filterState" @update-filter="(f) => (filterState = f)" />
            </div>
        </div>

        <div class="selected-count form-text mb-2">
            {{ $t("selectedMonitorsCount", selected.length) }}
        </div>

        <div class="monitor-checklist">
            <div v-if="filteredList.length === 0" class="text-center form-text py-3">
                {{ $t("No Monitors, please") }}
            </div>
            <label v-for="monitor in filteredList" :key="monitor.id" class="monitor-row">
                <input type="checkbox" class="form-check-input" :checked="isSelected(monitor.id)" @change="toggle(monitor.id)" />
                <Status :status="monitor.status" />
                <span class="name">{{ monitor.name }}</span>
                <Tag v-for="tag in monitor.tags" :key="tag.tag_id" :item="tag" size="sm" />
            </label>
        </div>
    </div>
</template>

<script>
import MonitorListFilter from "./MonitorListFilter.vue";
import Status from "./Status.vue";
import Tag from "./Tag.vue";

export default {
    components: {
        MonitorListFilter,
        Status,
        Tag,
    },

    props: {
        /** Currently selected monitor IDs */
        modelValue: {
            type: Array,
            default: () => [],
        },
    },

    emits: ["update:modelValue"],

    data() {
        return {
            searchText: "",
            filterState: {
                status: null,
                active: null,
                tags: null,
            },
        };
    },

    computed: {
        selected() {
            return this.modelValue;
        },

        monitorList() {
            return Object.values(this.$root.monitorList || {});
        },

        filteredList() {
            return this.monitorList.filter((monitor) => this.filterFunc(monitor));
        },

        allVisibleSelected: {
            get() {
                return this.filteredList.length > 0 && this.filteredList.every((m) => this.isSelected(m.id));
            },
            set(checked) {
                const visibleIDs = this.filteredList.map((m) => m.id);
                if (checked) {
                    const merged = new Set([...this.selected, ...visibleIDs]);
                    this.$emit("update:modelValue", Array.from(merged));
                } else {
                    this.$emit(
                        "update:modelValue",
                        this.selected.filter((id) => !visibleIDs.includes(id))
                    );
                }
            },
        },
    },

    methods: {
        /**
         * Whether a monitor is currently selected
         * @param {number} id Monitor ID
         * @returns {boolean} true if selected
         */
        isSelected(id) {
            return this.selected.includes(id);
        },

        /**
         * Toggle a monitor's selected state
         * @param {number} id Monitor ID
         * @returns {void}
         */
        toggle(id) {
            if (this.isSelected(id)) {
                this.$emit("update:modelValue", this.selected.filter((existingID) => existingID !== id));
            } else {
                this.$emit("update:modelValue", [...this.selected, id]);
            }
        },

        /**
         * Matches MonitorList.vue's filterFunc: search text (name/hostname/url/tag),
         * status, active, and tag(Location) filters
         * @param {object} monitor Monitor object
         * @returns {boolean} true if the monitor matches the current search/filters
         */
        filterFunc(monitor) {
            let searchTextMatch = true;
            if (this.searchText !== "") {
                const loweredSearchText = this.searchText.toLowerCase();
                searchTextMatch =
                    monitor.name.toLowerCase().includes(loweredSearchText) ||
                    monitor.hostname?.toLowerCase().includes(loweredSearchText) ||
                    monitor.url?.toLowerCase().includes(loweredSearchText) ||
                    monitor.tags.some(
                        (tag) =>
                            tag.name.toLowerCase().includes(loweredSearchText) ||
                            tag.value?.toLowerCase().includes(loweredSearchText)
                    );
            }

            let statusMatch = true;
            if (this.filterState.status != null && this.filterState.status.length > 0) {
                statusMatch = this.filterState.status.includes(monitor.status);
            }

            let activeMatch = true;
            if (this.filterState.active != null && this.filterState.active.length > 0) {
                activeMatch = this.filterState.active.includes(monitor.active);
            }

            let tagsMatch = true;
            if (this.filterState.tags != null && this.filterState.tags.length > 0) {
                tagsMatch =
                    monitor.tags.map((tag) => tag.tag_id).filter((id) => this.filterState.tags.includes(id))
                        .length > 0;
            }

            return searchTextMatch && statusMatch && activeMatch && tagsMatch;
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../assets/vars.scss";

.filter-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.search-wrapper {
    position: relative;
    flex: 1;
    min-width: 160px;
}

.search-icon {
    position: absolute;
    top: 9px;
    right: 10px;
    cursor: pointer;
    opacity: 0.6;
}

.filters-group {
    display: flex;
    align-items: center;
    gap: 10px;
}

.monitor-checklist {
    max-height: 280px;
    overflow-y: auto;
    border: 1px solid $highlight-white;
    border-radius: 10px;
}

.dark .monitor-checklist {
    border-color: $dark-border-color;
}

.monitor-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    cursor: pointer;
    border-bottom: 1px solid $highlight-white;

    &:last-child {
        border-bottom: none;
    }

    &:hover {
        background-color: $highlight-white;
    }

    .name {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}

.dark .monitor-row {
    border-bottom-color: $dark-border-color;

    &:hover {
        background-color: $dark-bg2;
    }
}
</style>
