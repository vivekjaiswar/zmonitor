<template>
    <div
        class="tag-wrapper rounded d-inline-flex"
        :class="{
            'px-3': size == 'normal',
            'py-1': size == 'normal',
            'm-2': size == 'normal',
            'px-2': size == 'sm',
            'py-0': size == 'sm',
        }"
        :style="{ backgroundColor: item.color, color: textColor, fontSize: size == 'sm' ? '0.7em' : '1em' }"
    >
        <span class="tag-text">{{ displayText }}</span>
        <span v-if="remove != null" class="ps-1 btn-remove" @click="remove(item)">
            <font-awesome-icon icon="times" />
        </span>
    </div>
</template>

<script>
/**
 * @typedef {import('./TagsManager.vue').Tag} Tag
 */

export default {
    props: {
        /**
         * Object representing tag
         * @type {Tag}
         */
        item: {
            type: Object,
            required: true,
        },
        /** Function to remove tag */
        remove: {
            type: Function,
            default: null,
        },
        /**
         * Size of tag
         * @type {"normal" | "small"}
         */
        size: {
            type: String,
            default: "normal",
        },
    },
    computed: {
        displayText() {
            if (this.item.value === "" || this.item.value === undefined || this.item.value === null) {
                return this.item.name;
            } else {
                return `${this.item.name}: ${this.item.value}`;
            }
        },

        /**
         * Picks black or white text so the tag label stays readable
         * regardless of how light or dark the tag's background color is.
         * @returns {string} "#000000" or "#ffffff"
         */
        textColor() {
            const hex = (this.item.color || "").replace("#", "");
            if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
                return "#ffffff";
            }
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            return luminance > 0.6 ? "#000000" : "#ffffff";
        },
    },
};
</script>

<style lang="scss" scoped>
.tag-wrapper {
    opacity: 0.85;

    .dark & {
        opacity: 1;
    }
}

.tag-text {
    padding-bottom: 1px !important;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
}

.btn-remove {
    font-size: 0.9em;
    line-height: 24px;
    opacity: 0.3;
}

.btn-remove:hover {
    opacity: 1;
}
</style>
