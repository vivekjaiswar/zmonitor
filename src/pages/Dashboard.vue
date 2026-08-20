<template>
    <div class="container-fluid">
        <div ref="row" class="row">
            <div
                v-if="!$root.isMobile"
                ref="listCol"
                class="col-12 col-md-5 col-xl-4 ps-0"
                :style="effectiveListWidth ? { flex: `0 0 ${effectiveListWidth}px`, maxWidth: 'none', minWidth: 0 } : {}"
            >
                <div v-if="$root.isAdmin">
                    <router-link to="/add" class="btn btn-primary mb-3">
                        <font-awesome-icon icon="plus" />
                        {{ $t("Add New Monitor") }}
                    </router-link>
                </div>
                <MonitorList :scrollbar="true" />
            </div>

            <div v-if="!$root.isMobile" class="resize-handle" @mousedown="startResize"></div>

            <div
                ref="container"
                class="col-12 col-md-7 col-xl-8 mb-3 gx-0"
                :style="effectiveListWidth ? { flex: '1 1 auto', maxWidth: 'none', minWidth: 0 } : { minWidth: 0 }"
            >
                <!-- Add :key to disable vue router re-use the same component -->
                <router-view :key="$route.fullPath" :calculatedHeight="height" />
            </div>
        </div>
    </div>
</template>

<script>
import MonitorList from "../components/MonitorList.vue";

const STORAGE_KEY = "dashboardListWidth";
const MIN_WIDTH = 220;
const MIN_CONTENT_WIDTH = 380;

export default {
    components: {
        MonitorList,
    },
    data() {
        return {
            height: 0,
            listWidth: Number(localStorage.getItem(STORAGE_KEY)) || null,
            rowWidth: 0,
        };
    },
    computed: {
        // Re-clamps the saved/dragged width against the row's current size, so a
        // width picked on a wide screen doesn't overflow after the window (or the
        // sidebar) shrinks.
        effectiveListWidth() {
            if (!this.listWidth || !this.rowWidth) {
                return null;
            }
            return Math.min(this.listWidth, Math.max(MIN_WIDTH, this.rowWidth - MIN_CONTENT_WIDTH));
        },
    },
    mounted() {
        this.height = this.$refs.container.offsetHeight;
        this.resizeObserver = new ResizeObserver((entries) => {
            this.rowWidth = entries[0].contentRect.width;
        });
        this.resizeObserver.observe(this.$refs.row);
    },
    beforeUnmount() {
        this.resizeObserver.disconnect();
    },
    methods: {
        /**
         * Begin dragging the divider between the monitor list and the content pane
         * @param {MouseEvent} event The mousedown event on the resize handle
         * @returns {void}
         */
        startResize(event) {
            event.preventDefault();
            const startX = event.clientX;
            const startWidth = this.$refs.listCol.getBoundingClientRect().width;

            const onMouseMove = (moveEvent) => {
                const width = startWidth + (moveEvent.clientX - startX);
                this.listWidth = Math.min(this.rowWidth - MIN_CONTENT_WIDTH, Math.max(MIN_WIDTH, width));
            };
            const onMouseUp = () => {
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
                document.body.style.cursor = "";
                document.body.style.userSelect = "";
                localStorage.setItem(STORAGE_KEY, this.listWidth);
            };

            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        },
    },
};
</script>

<style lang="scss" scoped>
.container-fluid {
    width: 98%;
}

.row {
    flex-wrap: nowrap;
}

.resize-handle {
    flex: 0 0 6px;
    cursor: col-resize;
    position: relative;

    &:hover::after,
    &:active::after {
        background-color: var(--bs-primary, #146ed2);
    }

    &::after {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        left: 2px;
        width: 2px;
        border-radius: 1px;
        background-color: transparent;
    }
}
</style>
