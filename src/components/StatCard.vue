<template>
    <div class="stat-card" :class="[`stat-card-${status}`, { 'stat-card-clickable': clickable }]" @click="$emit('click')">
        <div class="stat-card-label">{{ label }}</div>
        <div class="stat-card-value">{{ value }}</div>
    </div>
</template>

<script>
export default {
    props: {
        label: {
            type: String,
            required: true,
        },
        value: {
            type: [Number, String],
            required: true,
        },
        // "up" | "down" | "warn" | "neutral" - drives the value's status color.
        status: {
            type: String,
            default: "neutral",
        },
        clickable: {
            type: Boolean,
            default: false,
        },
    },
    emits: ["click"],
};
</script>

<style lang="scss" scoped>
@import "../assets/vars.scss";

.stat-card {
    background-color: #fff;
    border: 1px solid $card-border-color;
    border-radius: $border-radius;
    padding: 16px;

    .dark & {
        background-color: $dark-header-bg;
        border-color: $dark-border-color;
    }
}

.stat-card-clickable {
    cursor: pointer;
    transition: border-color 0.15s ease;

    &:hover {
        border-color: $primary;
    }
}

.stat-card-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: $secondary-text;
    margin-bottom: 8px;

    .dark & {
        color: $dark-font-color;
    }
}

.stat-card-value {
    font-family: $font-mono, monospace;
    font-size: 24px;
    font-weight: 600;
}

.stat-card-up .stat-card-value {
    color: $success;
}
.stat-card-down .stat-card-value {
    color: $danger;
}
.stat-card-warn .stat-card-value {
    color: $warning;
}
.stat-card-neutral .stat-card-value {
    color: $secondary-text;

    .dark & {
        color: $dark-font-color;
    }
}
</style>
