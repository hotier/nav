<template>
  <CategorySkeleton v-if="pending" />

  <EmptyState
    v-else-if="navLoaded && !category"
    icon="i-lucide-folder-x"
    title="分类不存在"
  />

  <div v-else-if="category" class="space-y-6">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-2xl font-bold text-foreground font-display">
        <span v-if="category.icon" class="mr-2 inline-block align-middle">
          <DynamicIcon :name="category.icon" class="h-6 w-6" />
        </span>
        {{ category.name }}
        <span class="ml-2 text-sm font-normal text-muted-foreground">({{ categoryLinks.length }})</span>
      </h2>
    </div>

    <LinksGrid
      v-if="filteredLinks.length > 0"
      :links="filteredLinks"
      :categories="categories"
      :is-admin="isAdmin"
      :search-query="liveQuery"
    />

    <EmptyState
      v-else-if="categoryLinks.length > 0"
      icon="i-lucide-search-x"
      title="没有匹配的链接"
      description="按 Enter 查看完整搜索结果"
    />

    <EmptyState v-else icon="i-lucide-inbox" title="该分类下没有链接" />

    <div v-if="category.children?.length" class="mt-8">
      <h3 class="mb-4 text-lg font-semibold">子分类</h3>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink
          v-for="child in category.children"
          :key="child.id"
          :to="`/category/${child.slug || child.id}`"
          class="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
        >
          <UIcon name="i-lucide-folder" class="h-5 w-5 text-muted-foreground" />
          <div>
            <p class="font-medium">{{ child.name }}</p>
            <p class="text-xs text-muted-foreground">{{ child._count?.links || 0 }} 个链接</p>
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Category, Link as LinkType, SessionUser } from "~~/shared/types";

definePageMeta({ key: (route) => `category-${route.params.slug}` });

const route = useRoute();
const requestFetch = useRequestFetch();

const { data: nav } = useQuery({
  key: qk.nav(),
  query: () =>
    withFallback(
      requestFetch<{ user: SessionUser | null; categories: Category[] }>("/api/nav"),
      { user: null, categories: [] },
    ),
});

const categoryName = computed(() =>
  nav.value?.categories.find((category) => category.slug === route.params.slug)?.name ?? "分类",
);
useHead(() => ({ title: categoryName.value }));

// 与首页共用 links-home 键：同一份全量数据，前端按 categoryId 过滤
const { data: linkData, status } = useQuery({
  key: qk.homeLinks(),
  query: () =>
    withFallback(
      requestFetch<{ data: LinkType[]; total: number }>("/api/links?page=1&pageSize=1000&sort=recent"),
      { data: [], total: 0 },
    ),
});

const categories = computed<Category[]>(() => nav.value?.categories ?? []);
const navLoaded = computed(() => nav.value !== null && nav.value !== undefined);
const isAdmin = computed(() => nav.value?.user?.role === "admin");

function findCategoryBySlug(slug: string, list: Category[]): Category | undefined {
  for (const cat of list) {
    if (cat.slug === slug) return cat;
    if (cat.children?.length) {
      const found = findCategoryBySlug(slug, cat.children);
      if (found) return found;
    }
  }
  return undefined;
}

const category = computed(() => {
  const slug = String(route.params.slug ?? "");
  return findCategoryBySlug(slug, categories.value);
});

const categoryLinks = computed<LinkType[]>(() =>
  (linkData.value?.data ?? []).filter((l) => l.categoryId === category.value?.id),
);

const { query: liveQuery } = useLiveSearch();
const filteredLinks = computed(() => {
  const q = liveQuery.value.trim();
  return q ? categoryLinks.value.filter((link) => matchLink(link, q)) : categoryLinks.value;
});

const pending = computed(() => status.value === "pending");
</script>
