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

        <!-- Desktop: persistent top nav bar (brand + nav links + search + profile).
             Replaces the earlier header+collapsible-sidebar shell - approved via
             /plan-design-review, 2026-09-27 (docs/isp-nms-frontend-redesign.md). -->
        <template v-if="!$root.isMobile">
            <header v-if="$root.loggedIn" class="app-header">
                <router-link to="/map" class="app-header-brand">
                    <img class="brand-icon" width="28" height="28" :src="appLogoUrl" />
                    <span class="title">{{ appName }}</span>
                </router-link>

                <nav class="topnav-links">
                    <router-link to="/dashboard" class="topnav-link" :style="{ order: $root.info.dashboardFirst === false ? 2 : 1 }">
                        <font-awesome-icon icon="tachometer-alt" />
                        {{ $t("Dashboard") }}
                    </router-link>
                    <router-link to="/map" class="topnav-link" :style="{ order: $root.info.dashboardFirst === false ? 1 : 2 }">
                        <font-awesome-icon icon="map-marker-alt" />
                        {{ $t("Network Map") }}
                    </router-link>
                    <router-link to="/list" class="topnav-link" style="order: 3">
                        <font-awesome-icon icon="list" />
                        {{ $t("List") }}
                    </router-link>
                    <router-link to="/manage-status-page" class="topnav-link" style="order: 4">
                        <font-awesome-icon icon="stream" />
                        {{ $t("Status Pages") }}
                    </router-link>
                </nav>

                <!-- Global search, monitors-only scope per docs/isp-nms-frontend-redesign.md
                     Open Question 1: full cross-entity search stays a tracked TODO. -->
                <form class="topnav-search" role="search" @submit.prevent="submitGlobalSearch">
                    <font-awesome-icon icon="search" class="topnav-search-icon" />
                    <input
                        ref="globalSearchInput"
                        v-model="globalSearchText"
                        type="search"
                        :aria-label="$t('Search Monitors')"
                        :placeholder="$t('Search monitors...')"
                    />
                    <kbd class="topnav-search-kbd">{{ isMac ? "⌘K" : "Ctrl+K" }}</kbd>
                </form>

                <a
                    v-if="hasNewVersion"
                    target="_blank"
                    href="https://github.com/vivekjaiswar/zmonitor/releases"
                    class="topnav-update-link"
                    :title="$t('New Update')"
                >
                    <font-awesome-icon icon="arrow-alt-circle-up" />
                </a>

                <div class="dropdown dropdown-profile-pic">
                    <button type="button" class="profile-trigger" data-bs-toggle="dropdown" :aria-label="$t('Profile menu')">
                        <div class="profile-pic">{{ $root.usernameFirstChar }}</div>
                    </button>

                    <ul class="dropdown-menu dropdown-menu-end">
                        <li class="dropdown-item-text">{{ $root.username || $t("signedInDispDisabled") }}</li>
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
            </header>

            <div class="app-content">
                <main>
                    <router-view v-if="$root.loggedIn" />
                    <Login v-if="!$root.loggedIn && $root.allowLoginDialog" />
                </main>
            </div>
        </template>

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
            globalSearchText: "",
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

        isMac() {
            return navigator.platform.toUpperCase().includes("MAC");
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

        window.addEventListener("keydown", this.onGlobalSearchShortcut);
    },

    beforeUnmount() {
        this.toastContainerObserver.disconnect();
        window.removeEventListener("keydown", this.onGlobalSearchShortcut);
    },

    methods: {
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

        /**
         * Cmd/Ctrl+K focuses the top-nav global search input.
         * @param {KeyboardEvent} event Keydown event
         * @returns {void}
         */
        onGlobalSearchShortcut(event) {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                this.$refs.globalSearchInput?.focus();
            }
        },

        /**
         * Global search is scoped to monitors only for now (see
         * docs/isp-nms-frontend-redesign.md Open Question 1) - routes to the
         * existing monitor list with the query prefilled.
         * @returns {void}
         */
        submitGlobalSearch() {
            if (!this.globalSearchText.trim()) {
                return;
            }
            this.$router.push({ path: "/list", query: { q: this.globalSearchText.trim() } });
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

$app-header-height: 56px;

// Full top nav bar - brand, links, search, profile. Replaces the earlier
// header+collapsible-sidebar shell (approved via /plan-design-review,
// 2026-09-27 - docs/isp-nms-frontend-redesign.md).
.app-header {
    height: $app-header-height;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 16px;
    background-color: #f8f9fa;
    border-bottom: 1px solid $card-border-color;

    .dark & {
        background-color: $dark-header-bg;
        border-bottom-color: $dark-border-color;
    }
}

.app-header-brand {
    display: flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
    color: inherit;
    min-width: 0;
    flex-shrink: 0;
}

.topnav-links {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
}

.topnav-link {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: $border-radius;
    border-bottom: 2px solid transparent;
    color: $secondary-text;
    text-decoration: none;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;

    .dark & {
        color: $dark-font-color;
    }

    &:hover {
        background-color: rgba($primary, 0.08);
        color: $primary;
    }

    &.active {
        background-color: rgba($primary, 0.1);
        border-bottom-color: $primary;
        color: $primary;
        font-weight: 600;
    }
}

.topnav-search {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    width: 280px;
    max-width: 100%;
    padding: 6px 10px;
    border-radius: $border-radius;
    border: 1px solid $card-border-color;
    background-color: #fff;
    color: $secondary-text;
    flex-shrink: 1;
    min-width: 0;

    .dark & {
        background-color: $dark-bg;
        border-color: $dark-border-color;
    }

    .topnav-search-icon {
        flex-shrink: 0;
        font-size: 12px;
    }

    input {
        flex: 1;
        min-width: 0;
        border: none;
        background: transparent;
        color: inherit;
        font-size: 12.5px;
        outline: none;

        &::placeholder {
            color: $secondary-text;
        }
    }

    .topnav-search-kbd {
        flex-shrink: 0;
        font-family: $font-mono, monospace;
        font-size: 10px;
        padding: 1px 5px;
        border-radius: 2px;
        border: 1px solid $card-border-color;
        color: $secondary-text;

        .dark & {
            border-color: $dark-border-color;
        }
    }
}

.topnav-update-link {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    border-radius: $border-radius;
    color: $primary;
    font-size: 16px;
}

.dropdown-profile-pic {
    flex-shrink: 0;

    .profile-trigger {
        display: flex;
        align-items: center;
        border: none;
        background: transparent;
        padding: 0;
        cursor: pointer;
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
        width: 28px;
        height: 28px;
        border-radius: $border-radius;
        font-weight: bold;
        font-size: 11px;
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
