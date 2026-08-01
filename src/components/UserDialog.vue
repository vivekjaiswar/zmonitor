<template>
    <form @submit.prevent="submit">
        <div ref="modal" class="modal fade" tabindex="-1" data-bs-backdrop="static">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            {{ isEdit ? $t("Edit Employee") : $t("Add Employee") }}
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" :aria-label="$t('Close')" />
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label for="user-username" class="form-label">{{ $t("Username") }}</label>
                            <input
                                id="user-username"
                                v-model="user.username"
                                type="text"
                                class="form-control"
                                autocomplete="off"
                                :disabled="isEdit"
                                required
                            />
                        </div>

                        <div class="mb-3">
                            <label for="user-password" class="form-label">{{ $t("Password") }}</label>
                            <input
                                id="user-password"
                                v-model="user.password"
                                type="password"
                                class="form-control"
                                autocomplete="new-password"
                                :placeholder="isEdit ? $t('leaveBlankToKeepPassword') : ''"
                                :required="!isEdit"
                            />
                        </div>

                        <div v-if="isEdit" class="form-check mb-3">
                            <input
                                id="user-active"
                                v-model="user.active"
                                class="form-check-input"
                                type="checkbox"
                            />
                            <label class="form-check-label" for="user-active">{{ $t("Active") }}</label>
                        </div>

                        <div class="mb-1">
                            <label class="form-label">{{ $t("employeeTagAccess") }}</label>
                            <div class="form-text mb-2">{{ $t("employeeTagAccessDesc") }}</div>

                            <div v-if="tagList.length === 0" class="form-text">
                                {{ $t("noTagsYet") }}
                            </div>

                            <div v-for="tag in tagList" :key="tag.id" class="form-check tag-option">
                                <input
                                    :id="`user-tag-${tag.id}`"
                                    v-model="user.tagIDs"
                                    class="form-check-input"
                                    type="checkbox"
                                    :value="tag.id"
                                />
                                <label class="form-check-label" :for="`user-tag-${tag.id}`">
                                    <Tag :item="{ name: tag.name, color: tag.color }" size="sm" />
                                </label>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" type="submit" :disabled="processing">
                            {{ isEdit ? $t("Save") : $t("Add") }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </form>
</template>

<script>
import { Modal } from "bootstrap";
import Tag from "./Tag.vue";

export default {
    components: {
        Tag,
    },

    emits: ["added", "edited"],

    data() {
        return {
            modal: null,
            processing: false,
            isEdit: false,
            user: {
                id: null,
                username: "",
                password: "",
                active: true,
                tagIDs: [],
            },
            tagList: [],
        };
    },

    mounted() {
        this.modal = new Modal(this.$refs.modal);
    },

    methods: {
        /**
         * Show the dialog to add a new employee
         * @returns {void}
         */
        show() {
            this.isEdit = false;
            this.user = {
                id: null,
                username: "",
                password: "",
                active: true,
                tagIDs: [],
            };
            this.loadTags();
            this.modal.show();
        },

        /**
         * Show the dialog to edit an existing employee
         * @param {object} existingUser Employee to edit, as returned by getUserList
         * @returns {void}
         */
        showEdit(existingUser) {
            this.isEdit = true;
            this.user = {
                id: existingUser.id,
                username: existingUser.username,
                password: "",
                active: existingUser.active,
                tagIDs: [...existingUser.tagIDs],
            };
            this.loadTags();
            this.modal.show();
        },

        /**
         * Load the full tag list so the admin can pick which ones to grant
         * @returns {void}
         */
        loadTags() {
            this.$root.getSocket().emit("getTags", (res) => {
                if (res.ok) {
                    this.tagList = res.tags;
                }
            });
        },

        /**
         * Submit the add/edit form to the server
         * @returns {void}
         */
        submit() {
            this.processing = true;

            const event = this.isEdit ? "editUser" : "addUser";

            this.$root.getSocket().emit(event, this.user, (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.modal.hide();
                    this.$emit(this.isEdit ? "edited" : "added");
                }
            });
        },
    },
};
</script>

<style lang="scss" scoped>
.tag-option {
    margin-bottom: 6px;

    .form-check-input {
        margin-top: 8px;
    }
}
</style>
