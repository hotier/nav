<template>
  <div>
    <div class="mb-6 flex items-center gap-2.5">
      <UIcon name="i-lucide-house" class="h-6 w-6 text-foreground" />
      <h2 class="text-2xl font-bold text-foreground font-display">
        全部书签
        <span v-if="!pending" class="ml-1.5 text-sm font-normal text-muted-foreground">
          ({{ shownCount }})
        </span>
      </h2>
      <UButton
        class="ml-auto"
        variant="soft"
        color="neutral"
        :icon="view === 'card' ? 'i-lucide-list' : 'i-lucide-layout-grid'"
        square
        :aria-label="view === 'card' ? '切换为紧凑视图' : '切换为卡片视图'"
        @click="toggleView"
      />
    </div>

    <CategorySkeleton v-if="pending" />

    <EmptyState
      v-else-if="links.length === 0"
      icon="i-lucide-bookmark"
      title="还没有书签"
      description="登录后可以添加和管理书签"
    >
      <NuxtLink
        to="/login"
        class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25"
      >
        前往登录 →
      </NuxtLink>
    </EmptyState>

    <EmptyState
      v-else-if="filtered.length === 0"
      icon="i-lucide-search-x"
      title="没有匹配的链接"
      description="按 Enter 查看完整搜索结果"
    />

    <LinksGrid
      v-else
      :links="filtered"
      :categories="categories"
      :is-admin="isAdmin"
      :search-query="liveQuery"
      :view="view"
    />
  </div>
</template>

<script setup lang="ts">
import type { Category, Link as LinkType, SessionUser } from "~~/shared/types";

const requestFetch = useRequestFetch();

useHead({ title: "首页" });

const { data: nav } = useQuery({
  key: qk.nav(),
  query: () =>
    withFallback(
      requestFetch<{ user: SessionUser | null; categories: Category[] }>("/api/nav"),
      { user: null, categories: [] },
    ),
});

const { data: linkData, status } = useQuery({
  key: qk.homeLinks(),
  query: () =>
    withFallback(
      requestFetch<{ data: LinkType[]; total: number }>("/api/links?page=1&pageSize=1000&sort=recent"),
      { data: [], total: 0 },
    ),
});
const pending = computed(() => status.value === "pending");

const isAdmin = computed(() => nav.value?.user?.role === "admin");
const categories = computed<Category[]>(() => nav.value?.categories ?? []);
const links = computed<LinkType[]>(() => linkData.value?.data ?? []);
const total = computed(() => linkData.value?.total ?? links.value.length);

const { query: liveQuery } = useLiveSearch();
const filtered = computed(() => {
  const q = liveQuery.value.trim();
  return q ? links.value.filter((link) => matchLink(link, q)) : links.value;
});
const shownCount = computed(() => (liveQuery.value.trim() ? filtered.value.length : total.value));

const view = useState<"card" | "compact">("links-view", () => "card");
onMounted(() => {
  if (localStorage.getItem("links-view") === "compact") view.value = "compact";
});

function toggleView() {
  view.value = view.value === "card" ? "compact" : "card";
  localStorage.setItem("links-view", view.value);
}
</script>
