<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-foreground font-display">设置</h1>
      <p class="mt-1 text-sm text-muted-foreground">管理外观与本地偏好</p>
    </div>

    <section class="rounded-2xl border border-border bg-card p-6">
      <div class="mb-5 flex items-start gap-4">
        <span class="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <UIcon name="i-lucide-sun-moon" class="h-6 w-6" />
        </span>
        <div>
          <h2 class="font-semibold text-foreground">主题外观</h2>
          <p class="text-sm text-muted-foreground">选择浅色、深色或跟随系统</p>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-3">
        <button
          v-for="option in themeOptions"
          :key="option.value"
          type="button"
          class="flex items-center gap-3 rounded-xl border p-4 text-left transition-colors"
          :class="theme === option.value
            ? 'border-primary bg-primary/5'
            : 'border-border hover:bg-muted'"
          @click="setTheme(option.value)"
        >
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            :class="theme === option.value ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'"
          >
            <UIcon :name="option.icon" class="h-5 w-5" />
          </span>
          <div class="min-w-0">
            <p class="text-sm font-medium" :class="theme === option.value ? 'text-primary' : 'text-foreground'">
              {{ option.label }}
            </p>
            <p class="text-xs text-muted-foreground">{{ option.description }}</p>
          </div>
          <UIcon
            v-if="theme === option.value"
            name="i-lucide-check"
            class="ml-auto h-4 w-4 shrink-0 text-primary"
          />
        </button>
      </div>

      <div class="mt-6 border-t border-border pt-5">
        <p class="text-sm font-medium text-foreground">主题色</p>
        <p class="mt-0.5 text-xs text-muted-foreground">用于按钮、链接与选中态</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            v-for="item in ACCENTS"
            :key="item.value"
            type="button"
            class="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors"
            :class="accent === item.value
              ? 'border-primary bg-primary/5 text-foreground'
              : 'border-border text-muted-foreground hover:bg-muted'"
            @click="setAccent(item.value)"
          >
            <span class="h-4 w-4 rounded-full" :style="{ background: item.swatch }" />
            {{ item.label }}
            <UIcon v-if="accent === item.value" name="i-lucide-check" class="h-3.5 w-3.5 text-primary" />
          </button>
        </div>
      </div>
    </section>

    <div class="grid gap-6 md:grid-cols-2">
      <section class="rounded-2xl border border-border bg-card p-6">
        <div class="mb-4 flex items-start gap-4">
          <span class="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
            <UIcon name="i-lucide-keyboard" class="h-6 w-6" />
          </span>
          <div>
            <h2 class="font-semibold text-foreground">快捷键</h2>
            <p class="text-sm text-muted-foreground">减少鼠标操作</p>
          </div>
        </div>
        <div class="space-y-2 text-sm">
          <div class="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-2.5">
            <span class="text-muted-foreground">聚焦搜索框</span>
            <UKbd>/</UKbd>
          </div>
          <div class="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-2.5">
            <span class="text-muted-foreground">打开命令面板</span>
            <UKbd>Ctrl K</UKbd>
          </div>
          <div class="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-2.5">
            <span class="text-muted-foreground">搜索结果页清空关键词</span>
            <UKbd>Esc</UKbd>
          </div>
        </div>
      </section>

      <section class="rounded-2xl border border-border bg-card p-6">
        <div class="mb-4 flex items-start gap-4">
          <span class="flex h-12 w-12 items-center justify-center rounded-xl bg-success/10 text-success">
            <UIcon name="i-lucide-refresh-cw" class="h-6 w-6" />
          </span>
          <div>
            <h2 class="font-semibold text-foreground">刷新数据</h2>
            <p class="text-sm text-muted-foreground">重新拉取当前页面与服务端数据</p>
          </div>
        </div>
        <UButton variant="soft" color="neutral" icon="i-lucide-refresh-cw" :loading="refreshing" @click="refreshAll">
          立即刷新
        </UButton>
      </section>
    </div>

    <section class="rounded-2xl border border-border bg-muted/20 p-5">
      <h3 class="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        <UIcon name="i-lucide-info" class="h-4 w-4 text-muted-foreground" />
        关于 OneNav
      </h3>
      <dl class="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <div class="flex justify-between gap-4"><dt>版本</dt><dd class="text-foreground">v0.2.0</dd></div>
        <div class="flex justify-between gap-4"><dt>框架</dt><dd class="text-foreground">Nuxt 4 · Nuxt UI 4</dd></div>
        <div class="flex justify-between gap-4"><dt>数据层</dt><dd class="text-foreground">Drizzle ORM · Neon</dd></div>
        <div class="flex justify-between gap-4"><dt>部署</dt><dd class="text-foreground">Vercel / Cloudflare Workers</dd></div>
      </dl>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: "auth", layout: "dashboard" });

const toast = useAppToast();
const { theme, setTheme } = useTheme();
const { accent, setAccent } = useAccent();

const themeOptions = [
  { value: "light" as const, label: "浅色", description: "明亮清晰", icon: "i-lucide-sun" },
  { value: "dark" as const, label: "深色", description: "夜间护眼", icon: "i-lucide-moon" },
  { value: "system" as const, label: "跟随系统", description: "自动切换", icon: "i-lucide-monitor" },
];

const refreshing = ref(false);

async function refreshAll() {
  refreshing.value = true;
  try {
    await useQueryCache().invalidateQueries();
    toast.success("数据已刷新");
  } finally {
    refreshing.value = false;
  }
}
</script>
