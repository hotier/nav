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
          <div class="flex-1 max-w-xl px-8 hidden sm:block">
            <div class="flex items-center h-10 rounded-xl border border-border bg-muted/80 text-foreground focus-within:bg-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-all overflow-hidden">
              <svg class="ml-3 h-4 w-4 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref="searchRef"
                v-model="searchQuery"
                type="text"
                placeholder="搜索书签… (按 / 快速聚焦)"
                class="flex-1 min-w-0 h-full bg-transparent px-3 text-sm placeholder:text-muted-foreground focus:outline-none"
                @keydown.enter="handleSearch"
              />
              <button
                type="button"
                class="hidden md:inline-flex items-center self-center px-2"
                title="打开命令面板"
                @click="paletteOpen = true"
              >
                <UKbd size="sm">Ctrl K</UKbd>
              </button>
              <button
                type="button"
                :disabled="!searchQuery.trim()"
                class="self-stretch flex items-center gap-1 px-3.5 bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                @click="handleSearch"
              >
                <UIcon name="i-lucide-search" class="h-3.5 w-3.5" />
                <span>搜索</span>
              </button>
            </div>
          </div>

          <!-- Right - Actions -->
          <div class="flex items-center gap-3">
            <ThemeSwitcher />

            <UDropdownMenu v-if="user" :items="userMenuItems" :content="{ align: 'end' }">
              <div :class="user.role === 'admin' ? 'admin-avatar-ring' : 'user-avatar-ring'">
                <button type="button" class="flex items-center justify-center w-9 h-9 rounded-full overflow-hidden cursor-pointer shadow-lg hover:shadow-xl transition-all" title="用户菜单">
                  <img v-if="user.image" :src="proxyImageUrl(user.image, 128)" alt="" class="h-full w-full object-cover" />
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
              <UIcon name="i-lucide-x" v-if="mobileMenuOpen" class="h-5 w-5" />
              <UIcon name="i-lucide-menu" v-else class="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </header>

    <div class="flex flex-1">
      <!-- Sidebar -->
      <aside class="w-60 flex-shrink-0 hidden lg:block bg-card border-r border-border p-4 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
        <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2 font-display">
          分类导航
        </h3>
        <nav class="space-y-1">
          <NavItem to="/" label="全部链接" icon="i-lucide-house" :active="isHome" />
          <div v-for="category in categories" :key="category.id">
            <NavItem
              v-if="category.slug"
              :to="`/category/${category.slug}`"
              :label="category.name"
              :icon="folderIcon"
              :active="route.path === `/category/${category.slug}`"
            />
            <div v-if="category.children?.length" class="ml-4 mt-1 space-y-1">
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

      <!-- Main -->
      <main class="flex-1 px-8 pt-8 flex flex-col min-w-0">
        <div class="flex-1">
          <slot />
        </div>
        <SiteFooter />
      </main>
    </div>

    <!-- Mobile menu -->
    <div v-if="mobileMenuOpen" class="fixed inset-0 z-40 bg-black/50 lg:hidden" @click.self="mobileMenuOpen = false">
      <div class="absolute right-0 top-0 h-full w-64 bg-card shadow-xl overflow-y-auto">
        <div class="p-4 border-b border-border flex items-center justify-between">
          <span class="font-bold text-primary">菜单</span>
          <button type="button" class="p-1 rounded-lg hover:bg-muted" @click="mobileMenuOpen = false">
            <UIcon name="i-lucide-x" class="h-5 w-5" />
          </button>
        </div>
        <nav class="p-4 space-y-1 text-sm">
          <NuxtLink to="/" class="mobile-link" @click="mobileMenuOpen = false">
            <UIcon name="i-lucide-house" class="h-4 w-4" />全部链接
          </NuxtLink>
          <template v-for="cat in categories" :key="cat.id">
            <NuxtLink v-if="cat.slug" :to="`/category/${cat.slug}`" class="mobile-link" @click="mobileMenuOpen = false">
              <DynamicIcon :name="cat.icon || 'Folder'" class="h-4 w-4" />{{ cat.name }}
            </NuxtLink>
            <NuxtLink
              v-for="child in cat.children || []"
              v-show="child.slug"
              :key="child.id"
              :to="`/category/${child.slug}`"
              class="mobile-link pl-10"
              @click="mobileMenuOpen = false"
            >
              <DynamicIcon :name="child.icon || 'Folder'" class="h-4 w-4" />{{ child.name }}
            </NuxtLink>
          </template>
          <hr class="my-4 border-border" />
          <NuxtLink to="/dashboard" class="mobile-link" @click="mobileMenuOpen = false">
            <UIcon name="i-lucide-layout-dashboard" class="h-4 w-4" />管理后台
          </NuxtLink>
        </nav>
      </div>
    </div>

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

<style scoped>
.mobile-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  border-radius: 0.5rem;
  font-weight: 500;
  color: var(--color-muted-foreground);
}
.mobile-link:hover {
  background: var(--color-muted);
}
</style>
