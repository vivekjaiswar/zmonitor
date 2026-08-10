<template>
    <div :class="classes">
        <div v-if="!$root.socket.connected && !$root.socket.firstConnect" class="lost-connection">
            <div class="container-fluid">
                {{ $root.connectionErrorMsg }}
                <div v-if="$root.showReverseProxyGuide">
                    {{ $t("Using a Reverse Proxy?") }}
                    <a href="mailto:info@zennialhub.in">
                        {{ $t("Check how to config it for WebSocket") }}
                    </a>
                </div>
            </div>
        </div>

        <div
            v-if="$root.isAdmin && licenseStatus && (licenseStatus.state !== 'VALID' || licenseStatus.staleNeverCheckedIn)"
            class="license-banner"
            :class="licenseStatus.staleNeverCheckedIn ? 'never_checked_in' : licenseStatus.state.toLowerCase()"
        >
            <div class="container-fluid">
                <template v-if="licenseStatus.staleNeverCheckedIn">
                    {{ $t("licenseNeverCheckedIn") }}
                </template>
                <template v-else-if="licenseStatus.state === 'GRACE_PERIOD'">
                    {{ $t("licenseGracePeriod") }}
                </template>
                <template v-else>
                    {{ $t("licenseSoftLocked") }}
                </template>
            </div>
        </div>

        <!-- Desktop: persistent left sidebar shell -->
        <div v-if="!$root.isMobile" class="app-shell">
            <button
                v-if="$root.loggedIn && sidebarHidden"
                type="button"
                class="sidebar-reveal-btn"
                :title="$t('showMenu')"
                @click="toggleSidebar"
            >
                <font-awesome-icon icon="bars" />
            </button>

            <aside v-if="$root.loggedIn && !sidebarHidden" class="app-sidebar">
                <div class="sidebar-brand-row">
                    <router-link to="/map" class="sidebar-brand">
                        <img class="brand-icon" width="28" height="28" :src="appLogoUrl" />
                        <span class="title">{{ appName }}</span>
                    </router-link>
                    <button
                        type="button"
                        class="sidebar-hide-btn"
                        :title="$t('hideMenu')"
                        @click="toggleSidebar"
                    >
                        <font-awesome-icon icon="angle-double-left" />
                    </button>
                </div>

                <nav class="sidebar-nav">
                    <router-link to="/map" class="sidebar-link">
                        <font-awesome-icon icon="map-marker-alt" />
                        {{ $t("Network Map") }}
                    </router-link>
                    <router-link to="/dashboard" class="sidebar-link">
                        <font-awesome-icon icon="tachometer-alt" />
                        {{ $t("Dashboard") }}
                    </router-link>
                    <router-link to="/manage-status-page" class="sidebar-link">
                        <font-awesome-icon icon="stream" />
                        {{ $t("Status Pages") }}
                    </router-link>
                </nav>

                <a
                    v-if="hasNewVersion"
                    target="_blank"
                    href="https://github.com/vivekjaiswar/zmonitor/releases"
                    class="sidebar-update-link"
                >
                    <font-awesome-icon icon="arrow-alt-circle-up" />
                    {{ $t("New Update") }}
                </a>

                <div class="sidebar-footer dropdown dropdown-profile-pic dropup">
                    <div class="sidebar-link profile-trigger" data-bs-toggle="dropdown">
                        <div class="profile-pic">{{ $root.usernameFirstChar }}</div>
                        <span class="profile-name">{{ $root.username || $t("signedInDispDisabled") }}</span>
                        <font-awesome-icon icon="angle-down" class="ms-auto" />
                    </div>

                    <ul class="dropdown-menu">
                        <li>
                            <router-link
                                to="/maintenance"
                                class="dropdown-item"
                                :class="{ active: $route.path.includes('manage-maintenance') }"
                            >
                                <font-awesome-icon icon="wrench" />
                                {{ $t("Maintenance") }}
                            </router-link>
                        </li>

                        <li v-if="$root.isAdmin">
                            <router-link
                                to="/settings/general"
                                class="dropdown-item"
                                :class="{ active: $route.path.includes('settings') }"
                            >
                                <font-awesome-icon icon="cog" />
                                {{ $t("Settings") }}
                            </router-link>
                        </li>

                        <li>
                            <a
                                href="https://github.com/vivekjaiswar/zmonitor"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="dropdown-item"
                            >
                                <font-awesome-icon icon="info-circle" />
                                {{ $t("Help") }}
                            </a>
                        </li>

                        <li v-if="$root.loggedIn && $root.socket.token !== 'autoLogin'">
                            <button class="dropdown-item" @click="$root.logout">
                                <font-awesome-icon icon="sign-out-alt" />
                                {{ $t("Logout") }}
                            </button>
                        </li>
                    </ul>
                </div>
            </aside>

            <div class="app-content">
                <main>
                    <router-view v-if="$root.loggedIn" />
                    <Login v-if="!$root.loggedIn && $root.allowLoginDialog" />
                </main>
            </div>
        </div>

        <!-- Mobile: unchanged top header + bottom-nav -->
        <template v-else>
            <header class="d-flex flex-wrap justify-content-center pt-2 pb-2 mb-3">
                <router-link to="/dashboard" class="d-flex align-items-center text-dark text-decoration-none">
                    <img class="bi" width="40" height="40" :src="appLogoUrl" />
                    <span class="fs-4 title ms-2">{{ appName }}</span>
                </router-link>
            </header>

            <main>
                <router-view v-if="$root.loggedIn" />
                <Login v-if="!$root.loggedIn && $root.allowLoginDialog" />
            </main>
        </template>

        <!-- Mobile Only -->
        <div v-if="$root.isMobile" style="width: 100%; height: calc(60px + env(safe-area-inset-bottom))" />
        <nav v-if="$root.isMobile && $root.loggedIn" class="bottom-nav">
            <router-link to="/dashboard" class="nav-link">
                <div><font-awesome-icon icon="tachometer-alt" /></div>
                {{ $t("Home") }}
            </router-link>

            <router-link to="/list" class="nav-link">
                <div><font-awesome-icon icon="list" /></div>
                {{ $t("List") }}
            </router-link>

            <router-link to="/map" class="nav-link">
                <div><font-awesome-icon icon="map-marker-alt" /></div>
                {{ $t("Network Map") }}
            </router-link>

            <router-link v-if="$root.isAdmin" to="/add" class="nav-link">
                <div><font-awesome-icon icon="plus" /></div>
                {{ $t("Add") }}
            </router-link>

            <router-link v-if="$root.isAdmin" to="/settings" class="nav-link">
                <div><font-awesome-icon icon="cog" /></div>
                {{ $t("Settings") }}
            </router-link>
        </nav>

        <button
            v-if="numActiveToasts != 0"
            type="button"
            class="btn btn-normal clear-all-toast-btn"
            @click="clearToasts"
        >
            <font-awesome-icon icon="times" />
        </button>
    </div>
</template>

<script>
import Login from "../components/Login.vue";
import compareVersions from "compare-versions";
import { useToast } from "vue-toastification";
const toast = useToast();

export default {
    components: {
        Login,
    },

    data() {
        return {
            toastContainer: null,
            numActiveToasts: 0,
            toastContainerObserver: null,
            licenseStatus: null,
            sidebarHidden: localStorage.getItem("sidebarHidden") === "true",
        };
    },

    computed: {
        // Theme or Mobile
        classes() {
            const classes = {};
            classes[this.$root.theme] = true;
            classes["mobile"] = this.$root.isMobile;
            return classes;
        },

        hasNewVersion() {
            if (this.$root.info.latestVersion && this.$root.info.version) {
                return compareVersions(this.$root.info.latestVersion, this.$root.info.version) >= 1;
            } else {
                return false;
            }
        },

        appName() {
            return this.$root.info.customAppName || "ZMonitor";
        },

        appLogoUrl() {
            const logoUrl = this.$root.info.customLogoUrl;
            if (!logoUrl) {
                return "/icon.png";
            }
            if (logoUrl.startsWith("data:") || logoUrl.startsWith("http")) {
                return logoUrl;
            }
            return this.$root.baseURL + logoUrl;
        },
    },

    watch: {
        // mounted() can fire before the socket finishes auth-ing (see the
        // allowLoginDialog comment in mixins/socket.js for the same race) -
        // catch the case where login completes after Layout already mounted.
        "$root.isAdmin"(isAdmin) {
            if (isAdmin) {
                this.fetchLicenseStatus();
            }
        },
    },

    mounted() {
        this.toastContainer = document.querySelector(".bottom-right.toast-container");

        // Watch the number of active toasts
        this.toastContainerObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === "childList") {
                    this.numActiveToasts = mutation.target.children.length;
                }
            }
        });

        if (this.toastContainer != null) {
            this.toastContainerObserver.observe(this.toastContainer, { childList: true });
        }

        if (this.$root.isAdmin) {
            this.fetchLicenseStatus();
        }
    },

    beforeUnmount() {
        this.toastContainerObserver.disconnect();
    },

    methods: {
        /**
         * Toggle the desktop sidebar's visibility and persist the choice.
         * @returns {void}
         */
        toggleSidebar() {
            this.sidebarHidden = !this.sidebarHidden;
            localStorage.setItem("sidebarHidden", this.sidebarHidden);
        },

        /**
         * Clear all toast notifications.
         * @returns {void}
         */
        clearToasts() {
            toast.clear();
        },

        fetchLicenseStatus() {
            this.$root.getSocket().emit("getLicenseStatus", (res) => {
                if (res.ok) {
                    this.licenseStatus = res;
                }
            });
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../assets/vars.scss";

.brand-icon {
    border-radius: 6px;
}

.title {
    font-family: $font-sans, sans-serif;
    font-weight: 600 !important;
    letter-spacing: -0.01em;
}

$sidebar-width: 240px;

.app-shell {
    display: flex;
    align-items: stretch;
    min-height: 100vh;
}

.app-sidebar {
    width: $sidebar-width;
    flex: 0 0 $sidebar-width;
    display: flex;
    flex-direction: column;
    position: sticky;
    top: 0;
    height: 100vh;
    background-color: #f8f9fa;
    border-right: 1px solid $card-border-color;
    padding: 16px 0;

    .dark & {
        background-color: $dark-header-bg;
        border-right-color: $dark-border-color;
    }
}

.sidebar-brand-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 12px 16px 20px;
}

.sidebar-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    color: inherit;
    min-width: 0;
}

.sidebar-hide-btn,
.sidebar-reveal-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    border: 1px solid $card-border-color;
    border-radius: $border-radius;
    background: transparent;
    color: $secondary-text;
    cursor: pointer;

    .dark & {
        border-color: $dark-border-color;
        color: $dark-font-color;
    }

    &:hover {
        color: $primary;
        border-color: $primary;
    }
}

.sidebar-reveal-btn {
    position: fixed;
    top: 16px;
    left: 16px;
    z-index: 20;
    background: #f8f9fa;

    .dark & {
        background-color: $dark-header-bg;
    }
}

.sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 12px;
}

.sidebar-link {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-radius: $border-radius;
    border-left: 3px solid transparent;
    color: $secondary-text;
    text-decoration: none;
    font-size: 14px;
    cursor: pointer;

    .dark & {
        color: $dark-font-color;
    }

    &:hover {
        background-color: rgba($primary, 0.08);
        color: $primary;
    }

    &.active {
        background-color: rgba($primary, 0.12);
        border-left-color: $primary;
        color: $primary;
        font-weight: 600;
    }
}

.sidebar-update-link {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 12px 12px 0;
    padding: 8px 12px;
    border-radius: $border-radius;
    background-color: $primary;
    color: #fff;
    text-decoration: none;
    font-size: 13px;
}

.sidebar-footer {
    margin-top: auto;
    padding: 12px;
    border-top: 1px solid $card-border-color;

    .dark & {
        border-top-color: $dark-border-color;
    }

    .profile-trigger {
        border-left: none;
    }

    .profile-name {
        font-size: 13px;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}

.app-content {
    flex: 1;
    min-width: 0;
    padding: 24px 32px;
}

.bottom-nav {
    z-index: 1000;
    position: fixed;
    bottom: 0;
    height: calc(60px + env(safe-area-inset-bottom));
    width: 100%;
    left: 0;
    background-color: #fff;
    box-shadow:
        0 15px 47px 0 rgba(0, 0, 0, 0.05),
        0 5px 14px 0 rgba(0, 0, 0, 0.05);
    text-align: center;
    white-space: nowrap;
    padding: 0 10px env(safe-area-inset-bottom);

    a {
        text-align: center;
        width: 25%;
        display: inline-block;
        height: 100%;
        padding: 8px 10px 0;
        font-size: 13px;
        color: #c1c1c1;
        overflow: hidden;
        text-decoration: none;

        &.router-link-exact-active,
        &.active {
            color: var(--brand-primary);
            font-weight: bold;
        }

        div {
            font-size: 20px;
        }
    }
}

// Only the mobile layout (top header + bottom-nav) needs main to reserve
// space for those bars - the desktop sidebar shell sizes itself via flex.
.mobile main {
    min-height: calc(100vh - 160px);
}

.title {
    font-weight: bold;
}

.lost-connection {
    padding: 5px;
    background-color: crimson;
    color: white;
    position: fixed;
    width: 100%;
    z-index: 99999;
}

.license-banner {
    padding: 5px;
    color: white;
    text-align: center;

    &.grace_period {
        background-color: darkorange;
    }

    &.soft_locked {
        background-color: crimson;
    }

    &.never_checked_in {
        background-color: #6c757d;
    }
}

// Profile Pic Button with Dropdown
.dropdown-profile-pic {
    user-select: none;

    .dropdown-menu {
        transition: all 0.2s;
        padding-left: 0;
        padding-bottom: 0;
        margin-top: 8px !important;
        border-radius: 16px;
        overflow: hidden;

        .dropdown-divider {
            margin: 0;
            border-top: 1px solid rgba(0, 0, 0, 0.4);
            background-color: transparent;
        }

        .dropdown-item-text {
            font-size: 14px;
            padding-bottom: 0.7rem;
        }

        .dropdown-item {
            padding: 0.7rem 1rem;
        }

        .dark & {
            background-color: $dark-bg;
            color: $dark-font-color;
            border-color: $dark-border-color;

            .dropdown-item {
                color: $dark-font-color;

                &.active {
                    color: $dark-font-color2;
                    background-color: $highlight !important;
                }

                &:hover {
                    background-color: $dark-bg2;
                }
            }
        }
    }

    .profile-pic {
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        background-color: var(--brand-primary);
        width: 24px;
        height: 24px;
        margin-right: 5px;
        border-radius: 50rem;
        font-weight: bold;
        font-size: 10px;
    }
}

.dark {
    header {
        background-color: $dark-header-bg;
        border-bottom-color: $dark-header-bg !important;

        span {
            color: #f0f6fc;
        }
    }

    .bottom-nav {
        background-color: $dark-bg;
    }
}

.clear-all-toast-btn {
    position: fixed;
    right: 1em;
    bottom: 1em;
    font-size: 1.2em;
    padding: 9px 15px;
    width: 48px;
    box-shadow: 2px 2px 30px rgba(0, 0, 0, 0.2);
    z-index: 100;

    .dark & {
        box-shadow: 2px 2px 30px rgba(0, 0, 0, 0.5);
    }
}

@media (max-width: 770px) {
    .clear-all-toast-btn {
        bottom: 72px;
    }
}
</style>
