<template>
  <div class="min-h-screen flex flex-col bg-background transition-colors duration-300">
    <!-- Header -->
    <header class="sticky top-0 z-50 bg-background/80 backdrop-blur-2xl border-b border-border">
      <div class="w-full px-6">
        <div class="flex items-center justify-between h-16">
          <div class="flex items-center">
            <NuxtLink to="/" class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-primary via-sky-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-primary/20">
                <span class="text-white font-bold text-xs font-display">ON</span>
              </div>
              <span class="font-bold text-lg text-foreground font-display">OneNav</span>
            </NuxtLink>
          </div>

          <!-- Center - Search -->
          <div class="hidden flex-1 px-4 sm:block">
            <div class="mx-auto flex max-w-3xl items-center gap-2">
              <UInput
                ref="searchRef"
                v-model="searchQuery"
                icon="i-lucide-search"
                placeholder="搜索书签… (按 / 快速聚焦)"
                class="flex-1"
                @keydown.enter="handleSearch"
              >
                <template #trailing>
                  <UKbd size="sm" class="cursor-pointer" @click="paletteOpen = true">Ctrl K</UKbd>
                </template>
              </UInput>
              <UButton
                :disabled="!searchQuery.trim()"
                icon="i-lucide-search"
                class="shrink-0"
                @click="handleSearch"
              >
                搜索
              </UButton>
            </div>
            <!-- 模式提示：输入即时过滤当前列表，Enter 才走服务端全量搜索 -->
            <p class="mx-auto mt-1 max-w-3xl px-1 text-[11px] text-muted-foreground">
              <template v-if="searchQuery.trim()">即时过滤当前列表 · <UKbd size="sm">Enter</UKbd> 搜索全部</template>
              <template v-else>输入即时过滤 · <UKbd size="sm">Enter</UKbd> 服务端全量搜索</template>
            </p>
          </div>

          <!-- Right - Actions -->
          <div class="flex items-center gap-3">
            <ThemeSwitcher />

            <UDropdownMenu v-if="user" :items="userMenuItems" :content="{ align: 'end' }">
              <div :class="user.role === 'admin' ? 'admin-avatar-ring' : 'user-avatar-ring'">
                <button type="button" class="flex items-center justify-center w-9 h-9 rounded-full overflow-hidden cursor-pointer shadow-lg hover:shadow-xl transition-all" title="用户菜单">
                  <img v-if="user.image" :src="proxyImageUrl(user.image, 128)" alt="" class="h-full w-full object-cover" >
                  <span v-else class="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary to-sky-500 text-white font-medium text-sm">
                    {{ (user.name || user.email || "U").charAt(0).toUpperCase() }}
                  </span>
                </button>
                <span :class="user.role === 'admin' ? 'admin-avatar-badge' : 'user-avatar-badge'">
                  {{ user.role === "admin" ? "管" : "普" }}
                </span>
              </div>
            </UDropdownMenu>

            <NuxtLink v-else to="/login" class="px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium shadow-lg shadow-primary/25 hover:bg-primary/90 transition-colors">
              登录
            </NuxtLink>

            <button
              type="button"
              class="lg:hidden inline-flex items-center justify-center h-9 w-9 rounded-xl text-muted-foreground hover:bg-muted"
              @click="mobileMenuOpen = !mobileMenuOpen"
            >
              <UIcon v-if="mobileMenuOpen" name="i-lucide-x" class="h-5 w-5" />
              <UIcon v-else name="i-lucide-menu" class="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </header>

    <div class="flex flex-1">
      <!-- Sidebar：与后台侧栏同宽同密度（w-52 / 36px 行高），两侧切换时视觉连续 -->
      <aside class="sticky top-16 hidden h-[calc(100vh-4rem)] w-52 shrink-0 overflow-y-auto border-r border-border bg-card px-3 py-4 lg:block">
        <h3 class="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-display">
          分类导航
        </h3>
        <nav class="mt-2 space-y-0.5">
          <NavItem to="/" label="全部链接" icon="i-lucide-house" :active="isHome" />
          <div v-for="category in categories" :key="category.id">
            <NavItem
              v-if="category.slug"
              :to="`/category/${category.slug}`"
              :label="category.name"
              :icon="folderIcon"
              :active="route.path === `/category/${category.slug}`"
            />
            <div v-if="category.children?.length" class="ml-3 mt-0.5 space-y-0.5">
              <NavItem
                v-for="child in category.children"
                v-show="child.slug"
                :key="child.id"
                :to="`/category/${child.slug}`"
                :label="child.name"
                :icon="folderIcon"
                :active="route.path === `/category/${child.slug}`"
              />
            </div>
          </div>
        </nav>
      </aside>

      <!-- Main：留白与后台对齐（px-4 / sm:px-6 / lg:px-8），窄屏不再被 32px 挤掉内容宽度 -->
      <main class="flex min-w-0 flex-1 flex-col px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8">
        <div class="flex-1">
          <slot />
        </div>
        <SiteFooter />
      </main>
    </div>

    <!-- Mobile menu：统一用 USlideover（自带焦点陷阱、ESC 关闭、滚动锁） -->
    <USlideover v-model:open="mobileMenuOpen" title="分类导航" side="right">
      <template #body>
        <nav class="space-y-1 text-sm">
          <NuxtLink
            to="/"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium transition-colors"
            :class="isHome ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
            @click="mobileMenuOpen = false"
          >
            <UIcon name="i-lucide-house" class="h-4 w-4" />全部链接
          </NuxtLink>
          <template v-for="cat in categories" :key="cat.id">
            <NuxtLink
              v-if="cat.slug"
              :to="`/category/${cat.slug}`"
              class="flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium transition-colors"
              :class="route.path === `/category/${cat.slug}` ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
              @click="mobileMenuOpen = false"
            >
              <DynamicIcon :name="cat.icon || 'Folder'" class-name="h-4 w-4" />{{ cat.name }}
            </NuxtLink>
            <NuxtLink
              v-for="child in cat.children || []"
              v-show="child.slug"
              :key="child.id"
              :to="`/category/${child.slug}`"
              class="flex items-center gap-3 rounded-lg py-2.5 pl-9 pr-3 text-sm transition-colors"
              :class="route.path === `/category/${child.slug}` ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
              @click="mobileMenuOpen = false"
            >
              <DynamicIcon :name="child.icon || 'Folder'" class-name="h-4 w-4" />{{ child.name }}
            </NuxtLink>
          </template>
          <div class="my-3 h-px bg-border" />
          <NuxtLink
            to="/dashboard"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            @click="mobileMenuOpen = false"
          >
            <UIcon name="i-lucide-layout-dashboard" class="h-4 w-4" />管理后台
          </NuxtLink>
        </nav>
      </template>
    </USlideover>

    <CommandPalette />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { Category, SessionUser } from "~~/shared/types";

const route = useRoute();
const router = useRouter();
const requestFetch = useRequestFetch();

const { data: nav } = useQuery({
  key: qk.nav(),
  query: () =>
    withFallback(
      requestFetch<{ user: SessionUser | null; categories: Category[] }>("/api/nav"),
      { user: null, categories: [] },
    ),
});
const queryCache = useQueryCache();

const user = computed(() => nav.value?.user ?? null);
const categories = computed<Category[]>(() => nav.value?.categories ?? []);
const isHome = computed(() => route.path === "/");
const folderIcon = "i-lucide-folder";

const searchRef = ref<HTMLInputElement | null>(null);
const searchQuery = ref(typeof route.query.q === "string" ? route.query.q : "");
const mobileMenuOpen = ref(false);
const paletteOpen = useState("command-palette-open", () => false);
const { query: liveQuery } = useLiveSearch();

watch(searchQuery, (value) => (liveQuery.value = value));

watch(
  () => route.query.q,
  (q) => {
    if (typeof q === "string") searchQuery.value = q;
  },
);

function handleSearch() {
  const q = searchQuery.value.trim();
  if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
}

const userMenuItems = computed(() => [
  isHome.value
    ? { label: "管理后台", icon: "i-lucide-layout-dashboard", onSelect: () => router.push("/dashboard") }
    : { label: "回到首页", icon: "i-lucide-house", onSelect: () => router.push("/") },
  { label: "账户管理", icon: "i-lucide-user", onSelect: () => router.push("/dashboard/account") },
  { label: "退出登录", icon: "i-lucide-log-out", color: "error" as const, onSelect: signOut },
]);

async function signOut() {
  await $fetch("/api/auth/logout", { method: "POST" });
  await queryCache.invalidateQueries({ key: qk.nav() });
  router.push("/");
}

function handleKeydown(e: KeyboardEvent) {
  if (
    e.key === "/" &&
    !e.ctrlKey &&
    !e.metaKey &&
    !["INPUT", "TEXTAREA", "SELECT"].includes((document.activeElement as HTMLElement)?.tagName) &&
    document.activeElement?.getAttribute("contenteditable") !== "true"
  ) {
    e.preventDefault();
    searchRef.value?.focus();
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>
