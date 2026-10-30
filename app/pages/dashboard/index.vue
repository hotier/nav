<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-2xl font-bold text-foreground font-display">仪表盘</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        欢迎回来{{ user?.name ? `，${user.name}` : "" }}。这里是你的书签概览。
      </p>
    </div>

    <div v-if="pending" class="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
      <USkeleton v-for="i in 4" :key="i" class="h-40 rounded-2xl" />
    </div>

    <div v-else class="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
      <div
        v-for="card in cards"
        :key="card.label"
        class="rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-lg"
      >
        <div class="mb-4 flex items-start justify-between">
          <span class="flex h-12 w-12 items-center justify-center rounded-xl" :class="card.iconClass">
            <UIcon :name="card.icon" class="h-6 w-6" />
          </span>
          <UBadge variant="subtle" :color="card.color" size="sm">{{ card.tag }}</UBadge>
        </div>
        <div class="text-3xl font-bold tracking-tight font-display">
          {{ card.value }}
        </div>
        <p class="mt-1 text-sm text-muted-foreground">{{ card.label }}</p>
        <div class="mt-4 border-t border-border/60 pt-4 text-xs text-muted-foreground">
          {{ card.hint }}
        </div>
      </div>
    </div>

    <div>
      <div class="mb-4 flex items-center gap-3">
        <h2 class="text-lg font-semibold text-foreground font-display">快捷操作</h2>
        <div class="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
      </div>
      <div class="grid gap-4 md:grid-cols-3">
        <NuxtLink
          v-for="action in actions"
          :key="action.to"
          :to="action.to"
          class="group rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg"
        >
          <div class="flex items-start gap-4">
            <span class="flex h-12 w-12 items-center justify-center rounded-xl" :class="action.iconClass">
              <UIcon :name="action.icon" class="h-6 w-6" />
            </span>
            <div>
              <h3 class="font-semibold text-foreground group-hover:text-primary">{{ action.title }}</h3>
              <p class="mt-1 text-sm text-muted-foreground">{{ action.description }}</p>
            </div>
          </div>
          <div class="mt-4 flex items-center text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
            {{ action.cta }}
            <UIcon name="i-lucide-chevron-right" class="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SessionUser } from "~~/shared/types";

definePageMeta({ middleware: "auth", layout: "dashboard" });

interface DashboardStats {
  totalLinks: number;
  totalCategories: number;
  publicLinks: number;
  privateLinks: number;
}

const requestFetch = useRequestFetch();

const { data: sessionData } = useQuery({
  key: qk.session(),
  query: () =>
    withFallback(
      requestFetch<{ user: SessionUser | null }>("/api/auth/session"),
      { user: null },
    ),
});
const user = computed(() => sessionData.value?.user ?? null);

const { data: stats, status } = useQuery({
  key: qk.stats(),
  query: () =>
    withFallback(requestFetch<DashboardStats>("/api/dashboard/stats"), {
      totalLinks: 0,
      totalCategories: 0,
      publicLinks: 0,
      privateLinks: 0,
    }),
});
const pending = computed(() => status.value === "pending");

const cards = computed(() => {
  const data = stats.value ?? { totalLinks: 0, totalCategories: 0, publicLinks: 0, privateLinks: 0 };
  return [
    {
      label: "总链接数",
      value: data.totalLinks,
      tag: "链接",
      icon: "i-lucide-link-2",
      color: "primary" as const,
      iconClass: "bg-primary/10 text-primary",
      hint: `公开 ${data.publicLinks} · 私有 ${data.privateLinks}`,
    },
    {
      label: "分类总数",
      value: data.totalCategories,
      tag: "分类",
      icon: "i-lucide-folder",
      color: "secondary" as const,
      iconClass: "bg-violet-500/10 text-violet-500",
      hint: "有序管理你的书签",
    },
    {
      label: "公开链接",
      value: data.publicLinks,
      tag: "公开",
      icon: "i-lucide-globe",
      color: "success" as const,
      iconClass: "bg-success/10 text-success",
      hint: "所有人可见",
    },
    {
      label: "私有链接",
      value: data.privateLinks,
      tag: "私有",
      icon: "i-lucide-lock",
      color: "warning" as const,
      iconClass: "bg-warning/10 text-warning",
      hint: "仅自己可见",
    },
  ];
});

const actions = [
  {
    to: "/dashboard/links",
    title: "链接管理",
    description: "添加、编辑、删除和整理你的书签链接",
    cta: "开始管理",
    icon: "i-lucide-link-2",
    iconClass: "bg-primary/10 text-primary",
  },
  {
    to: "/dashboard/categories",
    title: "分类管理",
    description: "创建分类结构，管理二级分类和可见性",
    cta: "开始管理",
    icon: "i-lucide-folder",
    iconClass: "bg-violet-500/10 text-violet-500",
  },
  {
    to: "/dashboard/import-export",
    title: "导入导出",
    description: "从浏览器或其他平台导入书签，随时备份",
    cta: "立即前往",
    icon: "i-lucide-file-up",
    iconClass: "bg-success/10 text-success",
  },
];
</script>
