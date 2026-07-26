<template>
    <div class="login-shell">
        <div class="login-brand">
            <div class="grid-bg" aria-hidden="true"></div>
            <div class="sweep" aria-hidden="true"></div>
            <div class="login-brand-top">
                <img class="brand-mark-img" width="26" height="26" :src="appLogoUrl" alt="" />
                <span class="brand-mark">{{ appName }}</span>
            </div>
            <div class="login-brand-mid">
                <h2>{{ $t("loginTagline") }}</h2>
                <p>{{ $t("loginSubTagline") }}</p>
            </div>
        </div>

        <div class="login-form-side">
            <div class="form">
                <form @submit.prevent="submit">
                    <h1 class="h3 mb-1 fw-bold">{{ $t("Login") }}</h1>
                    <p class="sub">{{ $t("loginWelcomeBack") }}</p>

                    <div v-if="!tokenRequired" class="form-floating">
                        <input
                            id="floatingInput"
                            v-model="username"
                            type="text"
                            class="form-control"
                            placeholder="Username"
                            autocomplete="username"
                            required
                        />
                        <label for="floatingInput">{{ $t("Username") }}</label>
                    </div>

                    <div v-if="!tokenRequired" class="form-floating mt-3">
                        <input
                            id="floatingPassword"
                            v-model="password"
                            type="password"
                            class="form-control"
                            placeholder="Password"
                            autocomplete="current-password"
                            required
                        />
                        <label for="floatingPassword">{{ $t("Password") }}</label>
                    </div>

                    <div v-if="tokenRequired">
                        <div class="form-floating mt-3">
                            <input
                                id="otp"
                                ref="otpInput"
                                v-model="token"
                                type="text"
                                maxlength="6"
                                class="form-control"
                                placeholder="123456"
                                autocomplete="one-time-code"
                                required
                            />
                            <label for="otp">{{ $t("Token") }}</label>
                        </div>
                    </div>

                    <div class="form-check mb-3 mt-3 d-flex justify-content-center pe-4">
                        <div class="form-check">
                            <input
                                id="remember"
                                v-model="$root.remember"
                                type="checkbox"
                                value="remember-me"
                                class="form-check-input"
                            />

                            <label class="form-check-label" for="remember">
                                {{ $t("Remember me") }}
                            </label>
                        </div>
                    </div>
                    <button class="w-100 btn btn-primary" type="submit" :disabled="processing">
                        {{ $t("Login") }}
                    </button>

                    <div v-if="res && !res.ok" class="alert alert-danger mt-3" role="alert">
                        {{ $t(res.msg) }}
                    </div>
                </form>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    data() {
        return {
            processing: false,
            username: "",
            password: "",
            token: "",
            res: null,
            tokenRequired: false,
        };
    },

    computed: {
        appName() {
            return this.$root.info.customAppName || "ZMonitor";
        },

        appLogoUrl() {
            const logoUrl = this.$root.info.customLogoUrl;
            if (!logoUrl) {
                return "/icon.svg";
            }
            if (logoUrl.startsWith("data:") || logoUrl.startsWith("http")) {
                return logoUrl;
            }
            return this.$root.baseURL + logoUrl;
        },
    },

    watch: {
        tokenRequired(newVal) {
            if (newVal) {
                this.$nextTick(() => {
                    this.$refs.otpInput?.focus();
                });
            }
        },
    },

    mounted() {
        document.title += " - Login";
    },

    unmounted() {
        document.title = document.title.replace(" - Login", "");
    },

    methods: {
        /**
         * Submit the user details and attempt to log in
         * @returns {void}
         */
        submit() {
            this.processing = true;

            this.$root.login(this.username, this.password, this.token, (res) => {
                this.processing = false;

                if (res.tokenRequired) {
                    this.tokenRequired = true;
                } else {
                    this.res = res;
                }
            });
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../assets/vars.scss";

.login-shell {
    display: flex;
    min-height: calc(100vh - 160px);
    align-items: stretch;
}

.login-brand {
    flex: 0 0 42%;
    position: relative;
    background: #0b1a2c;
    color: #eef2f7;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 24px;
    padding: 48px;
    overflow: hidden;
    border-radius: 0 16px 16px 0;

    .grid-bg {
        position: absolute;
        inset: 0;
        opacity: 0.5;
        background-image: radial-gradient(circle, rgba(74, 155, 239, 0.35) 1px, transparent 1.4px);
        background-size: 22px 22px;
    }

    .sweep {
        position: absolute;
        inset: -20%;
        background: radial-gradient(circle at 30% 40%, rgba(20, 110, 210, 0.35), transparent 55%);
        animation: login-sweep 9s ease-in-out infinite alternate;
    }

    @media (prefers-reduced-motion: reduce) {
        .sweep {
            animation: none;
        }
    }
}

@keyframes login-sweep {
    from {
        transform: translate(-4%, -2%);
    }
    to {
        transform: translate(4%, 4%);
    }
}

.login-brand-top {
    position: relative;
    display: flex;
    align-items: center;
    gap: 9px;
    font-weight: 700;
    font-size: 16px;

    .brand-mark-img {
        border-radius: 6px;
    }
}

.login-brand-mid {
    position: relative;

    h2 {
        font-size: 25px;
        font-weight: 600;
        line-height: 1.3;
        color: #fff;
        max-width: 320px;
    }

    p {
        color: #9db0c4;
        font-size: 13.5px;
        margin-top: 10px;
        max-width: 300px;
        line-height: 1.6;
    }
}

.login-form-side {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
}

.form {
    width: 100%;
    max-width: 330px;
    padding: 15px;
    margin: auto;
    text-align: left;

    .sub {
        color: $secondary-text;
        font-size: 13px;
        margin-bottom: 24px;
    }
}

.form-floating {
    > label {
        padding-left: 1.3rem;
    }

    > .form-control {
        padding-left: 1.3rem;
    }
}

@media (max-width: 770px) {
    .login-brand {
        display: none;
    }

    .login-form-side {
        padding: 20px;
    }
}
</style>
