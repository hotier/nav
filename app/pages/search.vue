<template>
  <div>
    <div class="mb-6">
      <h2 class="flex items-baseline gap-2 text-2xl font-bold text-foreground font-display">
        搜索结果
        <span v-if="query && !pending" class="text-sm font-normal text-muted-foreground">
          {{ links.length }} 条
        </span>
      </h2>
    </div>

    <div v-if="query" class="mb-6 rounded-2xl border border-border bg-card/80 px-4 py-3 backdrop-blur-xl">
      <p class="text-sm text-muted-foreground">
        关键词 <span class="font-medium text-primary">「{{ query }}」</span>
      </p>
      <p class="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <template v-if="pending">
          <UIcon name="i-lucide-loader-circle" class="h-3.5 w-3.5 animate-spin" />
          正在搜索…
        </template>
        <template v-else>
          服务端全量搜索命中 {{ links.length }} 个链接
          <UKbd size="sm">Esc</UKbd>
          <span>清空关键词</span>
        </template>
      </p>
    </div>

    <EmptyState
      v-if="!query"
      icon="i-lucide-search"
      title="输入关键词搜索书签"
      description="在上方搜索框输入后按 Enter，走服务端全量搜索"
    />

    <EmptyState
      v-else-if="!pending && links.length === 0"
      icon="i-lucide-search-x"
      title="未找到相关链接"
      description="尝试更短的关键词，或检查是否被可见性规则过滤"
    />

    <LinksGrid
      v-else
      :links="links"
      :categories="categories"
      :is-admin="isAdmin"
      :search-query="query"
      :draggable="false"
    />
  </div>
</template>

<script setup lang="ts">
import type { Category, Link as LinkType, SessionUser } from "~~/shared/types";

const route = useRoute();
const router = useRouter();
const requestFetch = useRequestFetch();

useHead({ title: "搜索" });

const { data: nav } = useQuery({
  key: qk.nav(),
  query: () =>
    withFallback(
      requestFetch<{ user: SessionUser | null; categories: Category[] }>("/api/nav"),
      { user: null, categories: [] },
    ),
});

const query = computed(() => (typeof route.query.q === "string" ? route.query.q.trim() : ""));

const { data, status } = useQuery({
  key: () => qk.search(query.value),
  query: () =>
    withFallback(
      query.value
        ? requestFetch<LinkType[]>(`/api/search?q=${encodeURIComponent(query.value)}`)
        : Promise.resolve([] as LinkType[]),
      [] as LinkType[],
    ),
});

const pending = computed(() => status.value === "pending");
const links = computed<LinkType[]>(() => data.value ?? []);
const isAdmin = computed(() => nav.value?.user?.role === "admin");
const categories = computed<Category[]>(() => nav.value?.categories ?? []);

/** Esc 清空关键词回到空态（结果页是派生视图，不提供拖拽/编辑） */
function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && query.value) {
    e.preventDefault();
    router.push("/search");
  }
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>
