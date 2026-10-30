<template>
  <div class="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-sky-50 via-white to-cyan-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4">
    <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div class="absolute -top-32 -left-32 h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-sky-300/40 to-cyan-300/20 dark:from-sky-500/20 dark:to-cyan-500/10 blur-3xl" />
      <div class="absolute -bottom-40 -right-32 h-[32rem] w-[32rem] rounded-full bg-gradient-to-tr from-blue-300/40 to-indigo-300/20 dark:from-blue-500/20 dark:to-indigo-500/10 blur-3xl" />
      <div class="absolute top-1/3 right-1/4 h-72 w-72 rounded-full bg-gradient-to-br from-cyan-200/30 to-blue-200/20 dark:from-cyan-500/10 dark:to-blue-500/5 blur-3xl" />
      <div class="reset-grid absolute inset-0 opacity-[0.35] dark:opacity-[0.15]" />
    </div>

    <div class="relative w-full max-w-[440px]">
      <div class="text-center mb-8">
        <div class="relative inline-flex mb-5">
          <div class="absolute inset-0 rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-500 blur-2xl opacity-50" />
          <div class="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-blue-500 to-cyan-500 shadow-2xl shadow-sky-500/30">
            <UIcon name="i-lucide-compass" class="h-7 w-7 text-white" />
          </div>
        </div>
        <h1 class="reset-title text-3xl font-bold tracking-tight bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900 dark:from-white dark:via-slate-200 dark:to-white bg-clip-text text-transparent">
          OneNav
        </h1>
        <p class="text-sm text-muted-foreground mt-1.5">重置密码以恢复账号访问</p>
      </div>

      <!-- 邮件未配置：自助重置关闭 -->
      <div v-if="!emailConfigured" class="relative rounded-3xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl shadow-sky-500/5 overflow-hidden">
        <div class="p-7 sm:p-8 text-center">
          <div class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10">
            <UIcon name="i-lucide-circle-alert" class="h-7 w-7 text-amber-500" />
          </div>
          <h2 class="text-xl font-semibold text-foreground">未开放自助重置密码</h2>
          <p class="text-sm text-muted-foreground mt-2 leading-relaxed">
            当前系统未配置邮件服务，无法发送验证码。<br />
            如需重置密码，请联系站点管理员在后台为你重置。
          </p>
          <NuxtLink to="/login" class="inline-flex items-center gap-1 mt-6 text-xs text-muted-foreground hover:text-primary transition-colors">
            <UIcon name="i-lucide-arrow-left" class="h-3.5 w-3.5" />返回登录
          </NuxtLink>
        </div>
      </div>

      <template v-else>
        <!-- 步骤指示器 -->
        <ol class="mb-6 flex items-center justify-center gap-2 text-xs" aria-label="重置密码步骤">
          <li v-for="(s, i) in STEPS" :key="s.n" class="flex items-center">
            <div class="flex items-center gap-2">
              <div
                class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold border transition-all"
                :class="step > s.n
                  ? 'bg-gradient-to-br from-sky-500 to-cyan-500 border-transparent text-white'
                  : step === s.n
                    ? 'bg-background text-foreground border-sky-500 shadow-sm'
                    : 'bg-muted/40 text-muted-foreground border-border'"
              >
                <UIcon name="i-lucide-check" v-if="step > s.n" class="h-3.5 w-3.5" />
                <template v-else>{{ s.n }}</template>
              </div>
              <span class="font-medium" :class="step >= s.n ? 'text-foreground' : 'text-muted-foreground'">
                {{ s.label }}
              </span>
            </div>
            <span
              v-if="i < STEPS.length - 1"
              class="mx-2 h-px w-6 sm:w-8"
              :class="step > s.n ? 'bg-sky-500/60' : 'bg-border'"
              aria-hidden="true"
            />
          </li>
        </ol>

        <div class="relative">
          <div class="absolute -inset-1 rounded-3xl bg-gradient-to-r from-sky-500/20 via-cyan-500/20 to-blue-500/20 blur-xl opacity-60" aria-hidden="true" />
          <div class="relative rounded-3xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl shadow-sky-500/5 overflow-hidden">
            <div class="p-7 sm:p-8">
              <!-- 步骤 1 -->
              <form v-if="step === 1" class="space-y-4" @submit.prevent="handleVerifyCode">
                <div class="mb-6 text-center">
                  <h2 class="text-xl font-semibold text-foreground">邮箱验证</h2>
                  <p class="text-sm text-muted-foreground mt-1">输入注册邮箱获取验证码，验证通过后即可重置密码</p>
                </div>

                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground">注册邮箱</label>
                  <div class="relative">
                    <UIcon name="i-lucide-mail" class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      v-model="account"
                      type="email"
                      inputmode="email"
                      autocomplete="email"
                      placeholder="输入注册邮箱"
                      :disabled="isVerifying"
                      class="reset-input h-12 pl-11"
                    />
                  </div>
                  <p v-if="account.trim() !== '' && !EMAIL_REGEX.test(account.trim())" role="status" class="flex items-center gap-1.5 text-xs mt-1.5 text-danger">
                    <UIcon name="i-lucide-circle-alert" class="h-3.5 w-3.5 shrink-0" />
                    请输入正确的邮箱
                  </p>
                </div>

                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground">邮箱验证码</label>
                  <div class="relative">
                    <UIcon name="i-lucide-shield-check" class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      :value="code"
                      type="text"
                      inputmode="numeric"
                      maxlength="6"
                      placeholder="验证码"
                      :disabled="isVerifying"
                      class="reset-input h-12 pl-11 pr-[7.5rem] tracking-[0.3em] font-mono placeholder:tracking-normal placeholder:font-sans"
                      @input="code = ($event.target as HTMLInputElement).value.replace(/\D/g, '')"
                    />
                    <button
                      type="button"
                      :disabled="cooldown > 0 || isSending || isVerifying"
                      class="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 px-3.5 rounded-lg text-xs font-semibold transition-all"
                      :class="cooldown > 0 ? 'text-muted-foreground cursor-not-allowed' : 'text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 active:scale-[0.97]'"
                      @click="handleSendCode"
                    >
                      <span v-if="isSending" class="inline-flex items-center gap-1.5">
                        <span class="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                        发送中
                      </span>
                      <template v-else>{{ cooldown > 0 ? `${cooldown}s 后重发` : "获取验证码" }}</template>
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  :disabled="isVerifying"
                  class="w-full h-12 rounded-xl text-base font-semibold text-white bg-gradient-to-r from-sky-500 via-blue-500 to-cyan-500 hover:from-sky-600 hover:via-blue-600 hover:to-cyan-600 shadow-lg shadow-sky-500/25 transition-all duration-200 disabled:opacity-60"
                >
                  <span v-if="isVerifying" class="inline-flex items-center gap-2">
                    <span class="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    验证中...
                  </span>
                  <span v-else class="inline-flex items-center gap-2">
                    <UIcon name="i-lucide-shield-check" class="h-4 w-4" />
                    验证并继续
                  </span>
                </button>

                <p class="text-center text-xs text-muted-foreground">未收到验证码？请检查垃圾邮件或稍后重试</p>
              </form>

              <!-- 步骤 2 -->
              <form v-else class="space-y-4" @submit.prevent="handleReset">
                <div class="mb-6 text-center">
                  <h2 class="text-xl font-semibold text-foreground">设置新密码</h2>
                  <p class="text-sm text-muted-foreground mt-1">
                    邮箱已通过验证，为 <span class="text-foreground font-medium">{{ account }}</span> 设置新密码
                  </p>
                </div>

                <button type="button" class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors" @click="step = 1">
                  <UIcon name="i-lucide-arrow-left" class="h-3.5 w-3.5" />返回上一步
                </button>

                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground">新密码</label>
                  <div class="relative">
                    <UIcon name="i-lucide-lock" class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input v-model="newPassword" type="password" placeholder="输入新密码（至少6位）" autocomplete="new-password" :disabled="isSubmitting" class="reset-input h-12 pl-11" />
                  </div>
                </div>

                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground">确认新密码</label>
                  <div class="relative">
                    <UIcon name="i-lucide-lock" class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input v-model="confirmPassword" type="password" placeholder="再次输入新密码" autocomplete="new-password" :disabled="isSubmitting" class="reset-input h-12 pl-11" />
                  </div>
                </div>

                <button
                  type="submit"
                  :disabled="isSubmitting"
                  class="w-full h-12 rounded-xl text-base font-semibold text-white bg-gradient-to-r from-sky-500 via-blue-500 to-cyan-500 hover:from-sky-600 hover:via-blue-600 hover:to-cyan-600 shadow-lg shadow-sky-500/25 transition-all duration-200 disabled:opacity-60"
                >
                  <span v-if="isSubmitting" class="inline-flex items-center gap-2">
                    <span class="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    重置中...
                  </span>
                  <span v-else class="inline-flex items-center gap-2">
                    <UIcon name="i-lucide-key" class="h-4 w-4" />
                    重置密码
                  </span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </template>

      <p class="text-center mt-6 text-xs text-muted-foreground">
        <NuxtLink to="/login" class="inline-flex items-center gap-1 hover:text-foreground transition-colors">
          <UIcon name="i-lucide-arrow-left" class="h-3.5 w-3.5" />返回登录
        </NuxtLink>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";

definePageMeta({ layout: false });

useHead({ title: "重置密码" });

const toast = useAppToast();

const STEPS = [
  { n: 1, label: "验证邮箱" },
  { n: 2, label: "设置新密码" },
] as const;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOLDOWN_SECONDS = 60;

const step = ref<1 | 2>(1);
const account = ref("");
const code = ref("");
const resetToken = ref("");
const newPassword = ref("");
const confirmPassword = ref("");
const isSending = ref(false);
const isVerifying = ref(false);
const isSubmitting = ref(false);
const cooldown = ref(0);
const emailConfigured = ref(true);

let cooldownTimer: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  try {
    const meta = await $fetch<{ emailConfigured?: boolean }>("/api/meta");
    emailConfigured.value = meta.emailConfigured !== false;
  } catch {
    // 保留默认值
  }
});

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

function errorMessage(error: unknown, fallback: string): string {
  return (error as { data?: { error?: string } })?.data?.error || fallback;
}

async function handleSendCode() {
  const email = account.value.trim().toLowerCase();
  if (!email) return toast.error("请输入注册邮箱");
  if (!EMAIL_REGEX.test(email)) return toast.error("请输入正确的邮箱");
  if (cooldown.value > 0 || isSending.value) return;

  isSending.value = true;
  try {
    const res = await $fetch<{ message?: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: { email },
    });
    toast.success(res.message || "验证码已发送至你的邮箱");
    startCooldown();
  } catch (error) {
    toast.error(errorMessage(error, "发送失败"));
  } finally {
    isSending.value = false;
  }
}

async function handleVerifyCode() {
  const email = account.value.trim().toLowerCase();
  if (!email) return toast.error("请输入注册邮箱");
  if (!EMAIL_REGEX.test(email)) return toast.error("请输入正确的邮箱");
  if (!code.value.trim()) return toast.error("请输入验证码");

  isVerifying.value = true;
  try {
    const res = await $fetch<{ token: string }>("/api/auth/verify-code", {
      method: "POST",
      body: { email, code: code.value },
    });
    resetToken.value = res.token;
    toast.success("邮箱验证成功");
    step.value = 2;
  } catch (error) {
    toast.error(errorMessage(error, "验证失败"));
  } finally {
    isVerifying.value = false;
  }
}

async function handleReset() {
  if (newPassword.value.length < 6) return toast.error("新密码至少6位");
  if (newPassword.value !== confirmPassword.value) return toast.error("两次输入的新密码不一致");

  isSubmitting.value = true;
  try {
    await $fetch("/api/auth/reset-password", {
      method: "POST",
      body: { token: resetToken.value, newPassword: newPassword.value },
    });
    toast.success("密码已重置，请使用新密码登录");
    setTimeout(() => navigateTo("/login"), 1500);
  } catch (error) {
    toast.error(errorMessage(error, "重置失败"));
  } finally {
    isSubmitting.value = false;
  }
}

onBeforeUnmount(() => {
  if (cooldownTimer) clearInterval(cooldownTimer);
});
</script>

<style scoped>
.reset-grid {
  background-image:
    linear-gradient(to right, rgb(148 163 184) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(148 163 184) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
  -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
}
.reset-title {
  font-family: var(--font-space-grotesk);
}
.reset-input {
  width: 100%;
  border-radius: 0.75rem;
  border: 1px solid color-mix(in oklab, var(--color-border) 60%, transparent);
  background: color-mix(in oklab, var(--color-muted) 40%, transparent);
  font-size: 1rem;
  color: var(--color-foreground);
  padding-right: 0.75rem;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.reset-input::placeholder {
  color: var(--color-muted-foreground);
  font-size: 0.875rem;
}
.reset-input:focus {
  border-color: var(--color-ring);
  box-shadow: 0 0 0 1px var(--color-ring);
}
.reset-input:disabled {
  opacity: 0.6;
}
</style>
