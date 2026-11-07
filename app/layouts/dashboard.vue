<template>
  <div class="min-h-screen flex flex-col bg-background transition-colors duration-300">
    <header class="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-xl">
      <div class="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
        <div class="flex items-center gap-3">
          <UButton
            class="lg:hidden"
            variant="soft"
            color="neutral"
            icon="i-lucide-menu"
            square
            aria-label="打开菜单"
            @click="mobileOpen = true"
          />
          <UButton
            to="/"
            variant="soft"
            color="neutral"
            icon="i-lucide-arrow-left"
            square
            aria-label="返回首页"
          />
          <NuxtLink to="/dashboard" class="flex items-center gap-2.5">
            <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary via-sky-500 to-cyan-500 shadow-md shadow-primary/20">
              <span class="text-xs font-bold text-white font-display">ON</span>
            </span>
            <span class="hidden flex-col sm:flex">
              <span class="text-sm font-bold leading-none text-foreground font-display">OneNav</span>
              <span class="mt-0.5 text-[10px] leading-none text-muted-foreground">书签管理</span>
            </span>
          </NuxtLink>
        </div>

        <div class="flex items-center gap-2">
          <ThemeSwitcher />

          <UDropdownMenu v-if="user" :items="userMenu" :content="{ align: 'end' }">
            <button type="button" class="flex items-center gap-2 rounded-full" aria-label="用户菜单">
              <span :class="user.role === 'admin' ? 'admin-avatar-ring' : 'user-avatar-ring'">
                <span class="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full shadow-md">
                  <img
                    v-if="user.image"
                    :src="proxyImageUrl(user.image, 128)"
                    alt=""
                    class="h-full w-full object-cover"
                  >
                  <span
                    v-else
                    class="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary to-sky-500 text-sm font-medium text-white"
                  >
                    {{ initial }}
                  </span>
                </span>
                <span :class="user.role === 'admin' ? 'admin-avatar-badge' : 'user-avatar-badge'">
                  {{ user.role === "admin" ? "管" : "普" }}
                </span>
              </span>
            </button>
          </UDropdownMenu>

          <UButton v-else to="/login" size="sm">登录</UButton>
        </div>
      </div>
    </header>

    <div class="flex flex-1">
      <!--
        侧栏紧凑化：w-60 → w-52，导航行 44px → 36px（图标 9x9 → 7x7），
        快捷键提示改成底部一行细提示，不再占一整块卡片高度。
      -->
      <aside class="sticky top-16 hidden h-[calc(100vh-4rem)] w-52 shrink-0 flex-col overflow-y-auto border-r border-border bg-card px-3 py-4 lg:flex">
        <p class="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">
          管理后台
        </p>
        <nav class="mt-2 space-y-0.5">
          <NuxtLink
            v-for="item in visibleItems"
            :key="item.to"
            :to="item.to"
            class="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors"
            :class="isActive(item.to)
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-primary/8 hover:text-foreground'"
          >
            <UIcon
              :name="item.icon"
              class="h-[18px] w-[18px] shrink-0"
              :class="isActive(item.to) ? 'text-primary' : 'group-hover:text-primary'"
            />
            <span class="flex-1 truncate">{{ item.label }}</span>
            <UIcon v-if="isActive(item.to)" name="i-lucide-chevron-right" class="h-3.5 w-3.5" />
          </NuxtLink>
        </nav>

        <div class="mt-auto space-y-1 border-t border-border/60 pt-3 text-[11px] leading-relaxed text-muted-foreground">
          <p class="flex items-center gap-1.5"><UKbd size="sm">/</UKbd>聚焦搜索</p>
          <p class="flex items-center gap-1.5"><UKbd size="sm">Ctrl K</UKbd>命令面板</p>
        </div>
      </aside>

      <!--
        布局只负责外壳（间距 + 滚动），不再套一层卡片：
        各页面自己用 rounded-2xl border bg-card 组织内容，
        避免「卡片套卡片」导致边框双层、内边距叠加（外层 p-8 + 内层 p-6 = 左右 56px）。
      -->
      <main class="flex min-w-0 flex-1 flex-col px-4 pt-4 sm:px-6 lg:px-8 lg:pt-6">
        <div class="flex-1">
          <slot />
        </div>
        <SiteFooter />
      </main>
    </div>

    <USlideover v-model:open="mobileOpen" title="管理菜单" side="left">
      <template #body>
        <nav class="space-y-1">
          <NuxtLink
            v-for="item in visibleItems"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
            :class="isActive(item.to)
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
            @click="mobileOpen = false"
          >
            <UIcon :name="item.icon" class="h-5 w-5" />
            {{ item.label }}
          </NuxtLink>
        </nav>
      </template>
    </USlideover>

    <CommandPalette />
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { SessionUser } from "~~/shared/types";

const route = useRoute();
const requestFetch = useRequestFetch();
const toast = useAppToast();

const { data: sessionData } = useQuery({
  key: qk.session(),
  query: () =>
    withFallback(
      requestFetch<{ user: SessionUser | null }>("/api/auth/session"),
      { user: null },
    ),
});

const user = computed(() => sessionData.value?.user ?? null);
const isAdmin = computed(() => user.value?.role === "admin");
const initial = computed(() =>
  (user.value?.name || user.value?.email || "U").charAt(0).toUpperCase(),
);

const mobileOpen = ref(false);

const navItems: Array<{ to: string; label: string; icon: string; adminOnly?: boolean }> = [
  { to: "/dashboard", label: "仪表盘", icon: "i-lucide-layout-dashboard" },
  { to: "/dashboard/links", label: "链接管理", icon: "i-lucide-link-2" },
  { to: "/dashboard/categories", label: "分类管理", icon: "i-lucide-folder-open" },
  { to: "/dashboard/users", label: "用户管理", icon: "i-lucide-users", adminOnly: true },
  { to: "/dashboard/import-export", label: "导入导出", icon: "i-lucide-file-up" },
  { to: "/dashboard/account", label: "账户管理", icon: "i-lucide-user-round" },
  { to: "/dashboard/settings", label: "设置", icon: "i-lucide-settings-2" },
];

const visibleItems = computed(() => navItems.filter((item) => !item.adminOnly || isAdmin.value));

useHead(() => ({
  title: navItems.find((item) => route.path === item.to)?.label ?? "控制台",
}));

function isActive(to: string): boolean {
  return route.path === to;
}

async function signOut() {
  try {
    await $fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // 服务端已失效也继续清理本地状态
  }
  const { clear } = useUserSession();
  clear();
  toast.success("已退出登录");
  await navigateTo("/login");
}

const userMenu = computed<DropdownMenuItem[][]>(() => [
  [
    { label: "回到首页", icon: "i-lucide-home", onSelect: () => navigateTo("/") },
    { label: "账户管理", icon: "i-lucide-user-round", onSelect: () => navigateTo("/dashboard/account") },
  ],
  [
    { label: "退出登录", icon: "i-lucide-log-out", color: "error", onSelect: signOut },
  ],
]);
</script>
