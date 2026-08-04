<template>
    <div>
        <div class="add-btn">
            <button class="btn btn-primary me-2" type="button" @click="$refs.userDialog.show()">
                <font-awesome-icon icon="plus" />
                {{ $t("Add Employee") }}
            </button>
        </div>

        <div class="form-text mb-3">{{ $t("employeeUsersDesc") }}</div>

        <span v-if="employeeList.length === 0" class="d-flex align-items-center justify-content-center my-3">
            {{ $t("No Employees Yet") }}
        </span>

        <div v-for="user in employeeList" :key="user.id" class="item" :class="{ inactive: !user.active }">
            <div class="left-part">
                <div class="circle"></div>
                <div class="info">
                    <div class="title">{{ user.username }}</div>
                    <div class="status">
                        {{ user.active ? $t("Active") : $t("Inactive") }}
                    </div>
                    <div class="tags">
                        <Tag
                            v-for="tagID in user.tagIDs"
                            :key="tagID"
                            :item="tagDisplayItem(tagID)"
                            size="sm"
                        />
                        <span v-if="user.tagIDs.length === 0 && user.monitorIDs.length === 0" class="form-text">
                            {{ $t("noTagAccessGranted") }}
                        </span>
                        <span v-if="user.monitorIDs.length > 0" class="form-text individual-monitors-badge">
                            {{ $t("individualMonitorsGrantedCount", user.monitorIDs.length) }}
                        </span>
                    </div>
                </div>
            </div>

            <div class="buttons">
                <div class="btn-group" role="group">
                    <button class="btn btn-normal" @click="$refs.userDialog.showEdit(user)">
                        <font-awesome-icon icon="edit" />
                        {{ $t("Edit") }}
                    </button>

                    <button class="btn btn-danger" @click="deleteDialog(user.id)">
                        <font-awesome-icon icon="trash" />
                        {{ $t("Delete") }}
                    </button>
                </div>
            </div>
        </div>

        <Confirm
            ref="confirmDelete"
            btn-style="btn-danger"
            :yes-text="$t('Yes')"
            :no-text="$t('No')"
            @yes="deleteUser"
        >
            {{ $t("deleteEmployeeMsg") }}
        </Confirm>

        <UserDialog ref="userDialog" @added="loadUsers" @edited="loadUsers" />
    </div>
</template>

<script>
import UserDialog from "../UserDialog.vue";
import Tag from "../Tag.vue";
import Confirm from "../Confirm.vue";

export default {
    components: {
        UserDialog,
        Tag,
        Confirm,
    },

    data() {
        return {
            users: [],
            tagsByID: {},
            selectedUserID: null,
        };
    },

    computed: {
        employeeList() {
            return this.users.filter((user) => user.role !== "admin");
        },
    },

    mounted() {
        this.loadUsers();
        this.loadTags();
    },

    methods: {
        /**
         * Load the employee list from the server
         * @returns {void}
         */
        loadUsers() {
            this.$root.getSocket().emit("getUserList", (res) => {
                if (res.ok) {
                    this.users = res.users;
                }
            });
        },

        /**
         * Load tags so employee grants can be shown by name/color
         * @returns {void}
         */
        loadTags() {
            this.$root.getSocket().emit("getTags", (res) => {
                if (res.ok) {
                    this.tagsByID = Object.fromEntries(res.tags.map((tag) => [tag.id, tag]));
                }
            });
        },

        /**
         * Build a display item for the Tag component from a tag ID
         * @param {number} tagID ID of the tag
         * @returns {object} Item with name/color for the Tag component
         */
        tagDisplayItem(tagID) {
            const tag = this.tagsByID[tagID];
            return tag ? { name: tag.name, color: tag.color } : { name: "?", color: "#aaaaaa" };
        },

        /**
         * Show dialog to confirm deletion
         * @param {number} userID ID of employee to delete
         * @returns {void}
         */
        deleteDialog(userID) {
            this.selectedUserID = userID;
            this.$refs.confirmDelete.show();
        },

        /**
         * Delete the selected employee
         * @returns {void}
         */
        deleteUser() {
            this.$root.getSocket().emit("deleteUser", this.selectedUserID, (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    this.loadUsers();
                }
            });
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../../assets/vars.scss";

.add-btn {
    padding-top: 20px;
    padding-bottom: 20px;
}

.item {
    display: flex;
    align-items: center;
    gap: 10px;
    border-radius: 10px;
    transition: all ease-in-out 0.15s;
    justify-content: space-between;
    padding: 10px;
    min-height: 90px;
    margin-bottom: 5px;

    &:hover {
        background-color: $highlight-white;
    }

    .circle {
        width: 25px;
        height: 25px;
        border-radius: 50rem;
        background-color: var(--brand-primary);
    }

    &.inactive .circle {
        background-color: $dark-font-color;
    }

    .left-part {
        display: flex;
        gap: 12px;
        align-items: center;

        .info {
            .title {
                font-weight: bold;
                font-size: 20px;
            }

            .status {
                font-size: 14px;
            }

            .tags {
                margin-top: 4px;

                .individual-monitors-badge {
                    margin-left: 6px;
                }
            }
        }
    }

    .buttons {
        display: flex;
        gap: 8px;
    }
}

.dark {
    .item:hover {
        background-color: $dark-bg2;
    }
}
</style>
