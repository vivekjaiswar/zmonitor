<template>
    <div ref="modal" class="modal fade" tabindex="-1" data-bs-backdrop="static">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">{{ $t("Apply Tag") }}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" :aria-label="$t('Close')" />
                </div>
                <div class="modal-body">
                    <div v-if="tagList.length === 0" class="form-text">
                        {{ $t("noTagsYet") }}
                    </div>
                    <div v-else class="mb-3">
                        <label for="bulk-tag-select" class="form-label">{{ $t("Tags") }}</label>
                        <select id="bulk-tag-select" v-model="selectedTagID" class="form-select">
                            <option v-for="tag in tagList" :key="tag.id" :value="tag.id">
                                {{ tag.name }}
                            </option>
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button
                        class="btn btn-primary"
                        type="button"
                        :disabled="!selectedTagID"
                        data-bs-dismiss="modal"
                        @click="apply"
                    >
                        {{ $t("Apply") }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { Modal } from "bootstrap";

export default {
    emits: ["apply"],

    data() {
        return {
            modal: null,
            tagList: [],
            selectedTagID: null,
        };
    },

    mounted() {
        this.modal = new Modal(this.$refs.modal);
    },

    methods: {
        /**
         * Load tags and show the dialog
         * @returns {void}
         */
        show() {
            this.selectedTagID = null;
            this.$root.getSocket().emit("getTags", (res) => {
                if (res.ok) {
                    this.tagList = res.tags;
                }
            });
            this.modal.show();
        },

        /**
         * Emit the chosen tag ID to the parent
         * @returns {void}
         */
        apply() {
            if (this.selectedTagID) {
                this.$emit("apply", this.selectedTagID);
            }
        },
    },
};
</script>
