<template>
  <div class="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-sky-50 via-white to-cyan-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4">
    <!-- 背景装饰 -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div class="absolute -top-32 -left-32 h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-sky-300/40 to-cyan-300/20 dark:from-sky-500/20 dark:to-cyan-500/10 blur-3xl" />
      <div class="absolute -bottom-40 -right-32 h-[32rem] w-[32rem] rounded-full bg-gradient-to-tr from-blue-300/40 to-indigo-300/20 dark:from-blue-500/20 dark:to-indigo-500/10 blur-3xl" />
      <div class="absolute top-1/3 right-1/4 h-72 w-72 rounded-full bg-gradient-to-br from-cyan-200/30 to-blue-200/20 dark:from-cyan-500/10 dark:to-blue-500/5 blur-3xl" />
      <div class="login-grid absolute inset-0 opacity-[0.35] dark:opacity-[0.15]" />
    </div>

    <div class="relative w-full max-w-[440px]">
      <!-- 品牌区 -->
      <div class="text-center mb-8">
        <div class="relative inline-flex mb-5">
          <div class="absolute inset-0 rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-500 blur-2xl opacity-50" />
          <div class="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-blue-500 to-cyan-500 shadow-2xl shadow-sky-500/30">
            <UIcon name="i-lucide-compass" class="h-7 w-7 text-white" />
          </div>
        </div>
        <h1 class="login-title text-3xl font-bold tracking-tight bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900 dark:from-white dark:via-slate-200 dark:to-white bg-clip-text text-transparent">
          OneNav
        </h1>
        <p class="text-sm text-muted-foreground mt-1.5">简洁高效的书签管理工具</p>
      </div>

      <!-- 卡片 -->
      <div class="relative">
        <div class="absolute -inset-1 rounded-3xl bg-gradient-to-r from-sky-500/20 via-cyan-500/20 to-blue-500/20 blur-xl opacity-60" aria-hidden="true" />
        <div class="relative rounded-3xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl shadow-sky-500/5 overflow-hidden">
          <div class="p-7 sm:p-8">
            <!-- 模式切换 -->
            <div class="mb-6 flex justify-center">
              <div role="tablist" aria-label="登录模式切换" class="inline-flex p-1 rounded-full bg-muted/60 dark:bg-muted/30 border border-border/40">
                <button
                  v-for="opt in modeOptions"
                  :key="String(opt.value)"
                  type="button"
                  role="tab"
                  :aria-selected="isLogin === opt.value"
                  class="px-6 py-1.5 text-sm font-medium rounded-full transition-all duration-200"
                  :class="isLogin === opt.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
                  @click="switchMode(opt.value)"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>

            <div class="mb-6 text-center">
              <h2 class="text-xl font-semibold text-foreground">{{ isLogin ? "欢迎回来" : "创建账号" }}</h2>
              <p class="text-sm text-muted-foreground mt-1">
                {{ isLogin ? "登录以继续管理你的书签" : "验证邮箱后即可开启书签之旅" }}
              </p>
            </div>

            <form class="space-y-4" @submit.prevent="handleSubmit">
              <UInput
                v-model="username"
                :placeholder="isLogin ? '用户名 / 邮箱' : '用户名'"
                :disabled="isLoading"
                autocomplete="username"
                icon="i-lucide-user"
                size="lg"
                class="w-full"
              />

              <UInput
                v-if="!isLogin"
                v-model="email"
                type="email"
                placeholder="邮箱"
                :disabled="isLoading"
                autocomplete="email"
                icon="i-lucide-mail"
                size="lg"
                class="w-full"
              />

              <UInput
                v-if="!isLogin"
                :model-value="code"
                type="text"
                inputmode="numeric"
                maxlength="6"
                placeholder="验证码"
                :disabled="isLoading"
                icon="i-lucide-shield-check"
                size="lg"
                class="w-full"
                :ui="{ base: 'tracking-[0.3em] font-mono' }"
                @update:model-value="(v) => (code = String(v ?? '').replace(/\D/g, ''))"
              >
                <template #trailing>
                  <UButton
                    type="button"
                    variant="link"
                    color="primary"
                    size="xs"
                    :disabled="cooldown > 0 || isSending || isLoading"
                    :loading="isSending"
                    @click="handleSendCode"
                  >
                    {{ cooldown > 0 ? `${cooldown}s 后重发` : "获取验证码" }}
                  </UButton>
                </template>
              </UInput>

              <UInput
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="密码"
                :disabled="isLoading"
                :autocomplete="isLogin ? 'current-password' : 'new-password'"
                icon="i-lucide-lock"
                size="lg"
                class="w-full"
              >
                <template #trailing>
                  <UButton
                    type="button"
                    variant="link"
                    color="neutral"
                    size="xs"
                    tabindex="-1"
                    :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                    :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                    @click="showPassword = !showPassword"
                  />
                </template>
              </UInput>

              <UInput
                v-if="!isLogin"
                v-model="confirmPassword"
                :type="showPassword ? 'text' : 'password'"
                placeholder="确认密码"
                :disabled="isLoading"
                autocomplete="new-password"
                icon="i-lucide-lock"
                size="lg"
                class="w-full"
              />

              <div v-if="isLogin && emailConfigured" class="-mt-1 flex justify-end">
                <NuxtLink to="/reset-pwd" class="text-xs text-muted-foreground hover:text-primary transition-colors">
                  忘记密码？
                </NuxtLink>
              </div>

              <UButton
                type="submit"
                :loading="isLoading"
                block
                size="lg"
                class="h-12 rounded-xl bg-gradient-to-r from-sky-500 via-blue-500 to-cyan-500 text-base font-semibold text-white shadow-lg shadow-sky-500/25 hover:from-sky-600 hover:via-blue-600 hover:to-cyan-600 hover:shadow-xl hover:shadow-sky-500/35"
              >
                {{ isLogin ? "登录" : "创建账号" }}
              </UButton>
            </form>
          </div>
        </div>
      </div>

      <p class="text-center mt-6 text-xs text-muted-foreground">
        <NuxtLink to="/" class="inline-flex items-center gap-1 hover:text-foreground transition-colors">
          ← 返回首页
        </NuxtLink>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";

definePageMeta({ layout: false });

useHead({ title: "登录" });

const toast = useAppToast();
const { fetch: refreshUserSession } = useUserSession();

const route = useRoute();
const callbackUrl = computed(() => {
  const raw = typeof route.query.callbackUrl === "string" ? route.query.callbackUrl : "";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
});

const isLogin = ref(true);
const username = ref("");
const email = ref("");
const password = ref("");
const confirmPassword = ref("");
const code = ref("");
const isLoading = ref(false);
const isSending = ref(false);
const cooldown = ref(0);
const showPassword = ref(false);
const emailConfigured = ref(true);

let cooldownTimer: ReturnType<typeof setInterval> | null = null;

const modeOptions = computed(() =>
  emailConfigured.value
    ? [
        { value: true, label: "登录" },
        { value: false, label: "注册" },
      ]
    : [{ value: true, label: "登录" }],
);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOLDOWN_SECONDS = 60;

async function loadMeta() {
  try {
    const meta = await $fetch<{ emailConfigured?: boolean }>("/api/meta");
    emailConfigured.value = meta.emailConfigured !== false;
  } catch {
    // 保留默认值
  }
}
onMounted(loadMeta);

function switchMode(nextLogin: boolean) {
  if (nextLogin === isLogin.value) return;
  isLogin.value = nextLogin;
  password.value = "";
  confirmPassword.value = "";
  code.value = "";
}

function startCooldown() {
  cooldown.value = COOLDOWN_SECONDS;
  cooldownTimer = setInterval(() => {
    cooldown.value -= 1;
    if (cooldown.value <= 0 && cooldownTimer) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
  }, 1000);
}

async function handleSendCode() {
  const target = email.value.trim().toLowerCase();
  if (!target) return toast.error("请输入邮箱");
  if (!EMAIL_REGEX.test(target)) return toast.error("请输入正确的邮箱");
  if (cooldown.value > 0 || isSending.value) return;

  isSending.value = true;
  try {
    const res = await $fetch<{ message?: string }>("/api/auth/send-register-code", {
      method: "POST",
      body: { email: target },
    });
    toast.success(res.message || "验证码已发送至你的邮箱");
    startCooldown();
  } catch (error) {
    const msg = (error as { data?: { error?: string } })?.data?.error;
    toast.error(msg || "发送失败");
  } finally {
    isSending.value = false;
  }
}

async function handleSubmit() {
  if (!username.value.trim() || !password.value.trim()) return toast.error("请输入用户名和密码");
  if (!isLogin.value && !code.value.trim()) return toast.error("请输入邮箱验证码");
  if (!isLogin.value && password.value !== confirmPassword.value) return toast.error("两次输入的密码不一致");

  isLoading.value = true;
  try {
    if (isLogin.value) {
      await $fetch("/api/auth/login", {
        method: "POST",
        body: { username: username.value, password: password.value },
      });
      toast.success("登录成功");
      // 登录成功后立刻刷新客户端会话状态，避免跳转到需要 auth 的页面时中间态仍判定未登录
      await refreshUserSession();
      await navigateTo(callbackUrl.value);
    } else {
      await $fetch("/api/auth/register", {
        method: "POST",
        body: { username: username.value, email: email.value, password: password.value, code: code.value },
      });
      toast.success("注册成功，请登录");
      switchMode(true);
    }
  } catch (error) {
    const msg = (error as { data?: { error?: string } })?.data?.error;
    toast.error(msg || (isLogin.value ? "登录失败" : "注册失败"));
  } finally {
    isLoading.value = false;
  }
}

onBeforeUnmount(() => {
  if (cooldownTimer) clearInterval(cooldownTimer);
});
</script>

<style scoped>
.login-grid {
  background-image:
    linear-gradient(to right, rgb(148 163 184) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(148 163 184) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
  -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
}
.login-title {
  font-family: var(--font-space-grotesk);
}
</style>
