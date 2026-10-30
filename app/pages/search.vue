<template>
  <div>
    <div class="mb-6">
      <h2 class="text-2xl font-bold text-foreground font-display">
        搜索结果
        <span v-if="query" class="ml-2 text-sm font-normal text-muted-foreground">({{ links.length }})</span>
      </h2>
    </div>

    <div v-if="query" class="mb-6 rounded-2xl border border-border bg-card/80 p-4 backdrop-blur-xl">
      <p class="text-sm text-muted-foreground">
        关键词: <span class="font-medium text-primary">"{{ query }}"</span>
      </p>
      <p class="mt-1 text-xs text-muted-foreground">
        找到 {{ links.length }} 个相关链接
        <span v-if="pending" class="ml-2 inline-block animate-pulse">正在搜索...</span>
      </p>
    </div>

    <div v-if="!query" class="flex flex-col items-center justify-center py-24 text-center">
      <UIcon name="i-lucide-search" class="mb-4 h-12 w-12 text-muted-foreground/50" />
      <p class="text-lg font-semibold text-foreground">输入关键词搜索书签</p>
      <p class="mt-1 text-sm text-muted-foreground">在上方搜索框中输入关键词并按回车</p>
    </div>

    <div v-else-if="!pending && links.length === 0" class="flex flex-col items-center justify-center py-24 text-center">
      <UIcon name="i-lucide-search-x" class="mb-4 h-12 w-12 text-muted-foreground/50" />
      <p class="text-lg font-semibold text-foreground">未找到相关链接</p>
      <p class="mt-1 text-sm text-muted-foreground">尝试其他关键词</p>
    </div>

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
</script>
