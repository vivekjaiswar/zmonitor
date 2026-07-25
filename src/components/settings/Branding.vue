<template>
    <div>
        <form class="my-4" autocomplete="off" @submit.prevent="saveBranding">
            <p class="form-text">
                {{ $t("brandingDescription") }}
            </p>

            <!-- App Name -->
            <div class="mb-4">
                <label for="customAppName" class="form-label">
                    {{ $t("Application Name") }}
                </label>
                <input
                    id="customAppName"
                    v-model="settings.customAppName"
                    class="form-control"
                    placeholder="ZMonitor"
                />
                <div class="form-text">
                    {{ $t("brandingAppNameDescription") }}
                </div>
            </div>

            <!-- Logo -->
            <div class="mb-4">
                <label class="form-label d-block">
                    {{ $t("Logo") }}
                </label>

                <span class="logo-wrapper" @click="showImageCropUpload = true">
                    <img :src="logoURL" alt class="logo" />
                    <font-awesome-icon class="icon-upload" icon="upload" />
                </span>

                <ImageCropUpload
                    v-model="showImageCropUpload"
                    field="img"
                    :width="128"
                    :height="128"
                    :langType="$i18n.locale"
                    img-format="png"
                    :noCircle="true"
                    :noSquare="false"
                    @crop-success="cropSuccess"
                />

                <div class="form-text">
                    {{ $t("brandingLogoDescription") }}
                </div>

                <button
                    v-if="settings.customLogoUrl"
                    type="button"
                    class="btn btn-normal btn-sm mt-2"
                    @click="resetLogo"
                >
                    {{ $t("Reset to Default") }}
                </button>
            </div>

            <!-- Save Button -->
            <div>
                <button class="btn btn-primary" type="submit">
                    {{ $t("Save") }}
                </button>
            </div>
        </form>
    </div>
</template>

<script>
import ImageCropUpload from "vue-image-crop-upload";

export default {
    components: {
        ImageCropUpload,
    },

    data() {
        return {
            showImageCropUpload: false,
        };
    },

    computed: {
        settings() {
            return this.$parent.$parent.$parent.settings;
        },
        saveSettings() {
            return this.$parent.$parent.$parent.saveSettings;
        },
        logoURL() {
            if (this.settings.customLogoUrl) {
                if (this.settings.customLogoUrl.startsWith("data:")) {
                    return this.settings.customLogoUrl;
                }
                return this.$root.baseURL + this.settings.customLogoUrl;
            }
            return "/icon.png";
        },
    },

    methods: {
        /**
         * Save the branding settings
         * @returns {void}
         */
        saveBranding() {
            this.saveSettings();
        },

        /**
         * Handle a successful logo crop/upload
         * @param {string} imgDataUrl URL of image in data:// format
         * @returns {void}
         */
        cropSuccess(imgDataUrl) {
            this.settings.customLogoUrl = imgDataUrl;
        },

        /**
         * Reset the logo back to the default ZMonitor logo
         * @returns {void}
         */
        resetLogo() {
            this.settings.customLogoUrl = "";
        },
    },
};
</script>

<style lang="scss" scoped>
.logo-wrapper {
    display: inline-block;
    cursor: pointer;
    position: relative;

    .icon-upload {
        position: absolute;
        bottom: 4px;
        right: 4px;
        background-color: rgba(0, 0, 0, 0.5);
        color: white;
        padding: 6px;
        border-radius: 50%;
    }
}

.logo {
    width: 100px;
    height: 100px;
    object-fit: contain;
    border-radius: 10px;
    border: 1px solid #ced4da;
}
</style>
