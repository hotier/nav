<template>
  <div>
    <VueDraggable
      v-model="items"
      :animation="180"
      handle=".drag-handle"
      :disabled="!canDrag"
      :class="[
        'animate-fade-in-up delay-100',
        view === 'compact'
          ? 'flex flex-col gap-2'
          : 'grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5',
      ]"
      @end="persistOrder"
    >
      <LinkCard
        v-for="link in items"
        :key="link.id"
        :link="link"
        :categories="categories"
        :is-admin="isAdmin"
        :search-query="searchQuery"
        :draggable="canDrag"
        :compact="view === 'compact'"
        @update="handleUpdate"
        @delete="requestDelete"
      />
    </VueDraggable>

    <ConfirmDialog
      :open="!!deleteTargetId"
      title="删除链接"
      confirm-label="确认删除"
      :loading="isDeleting"
      :impact="deleteImpact"
      irreversible
      @update:open="(v) => { if (!v) deleteTargetId = null }"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import type { Category, Link as LinkType } from "~~/shared/types";

const toast = useAppToast();

const props = withDefaults(
  defineProps<{
    links: LinkType[];
    categories: Category[];
    isAdmin?: boolean;
    searchQuery?: string;
    draggable?: boolean;
    view?: "card" | "compact";
  }>(),
  { isAdmin: false, searchQuery: "", draggable: true, view: "card" },
);

const { notify } = useDataSync();

const items = ref<LinkType[]>([...props.links]);
const deleteTargetId = ref<string | null>(null);
const isDeleting = ref(false);

/** 删除影响范围：给出标题，让用户确认删的是哪一个（列表里可能有同名链接） */
const deleteImpact = computed(() => {
  const target = items.value.find((l) => l.id === deleteTargetId.value);
  return target ? [`将删除「${target.title}」`] : [];
});

watch(
  () => props.links,
  (links) => (items.value = [...links]),
);

// 拖拽仅在管理员 + 非派生视图（搜索结果）下启用：
// 派生视图拖拽会按子集重编号污染全局 sortOrder
const canDrag = computed(() => props.isAdmin && props.draggable);

function sortLinks(arr: LinkType[]): LinkType[] {
  return [...arr].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
}

async function persistOrder() {
  // 保持置顶/非置顶分组：置顶从 0 开始，非置顶从置顶数量后开始
  let pinnedIndex = 0;
  const pinnedCount = items.value.filter((l) => l.isPinned).length;
  let unpinnedIndex = pinnedCount;
  const updates = items.value.map((link) => ({
    id: link.id,
    sortOrder: link.isPinned ? pinnedIndex++ : unpinnedIndex++,
  }));

  try {
    await $fetch("/api/links/reorder", { method: "PUT", body: { updates } });
    notify("Link");
  } catch (error) {
    console.error("Failed to update sort order:", error);
  }
}

async function handleUpdate(id: string, data: Partial<LinkType>) {
  const prev = items.value;
  const before = items.value.find((l) => l.id === id);
  const pinChanged = "isPinned" in data && data.isPinned !== before?.isPinned;

  // 乐观更新：只替换该链接字段，置顶状态变化时才按服务端规则重排
  const next = items.value.map((l) => (l.id === id ? { ...l, ...data } : l));
  items.value = pinChanged ? sortLinks(next) : next;

  try {
    const updated = await $fetch<LinkType>(`/api/links/${id}`, { method: "PUT", body: data });
    const merged = items.value.map((l) => (l.id === id ? { ...l, ...updated } : l));
    items.value = pinChanged ? sortLinks(merged) : merged;
    toast.success("更新成功");
    notify("Link");
  } catch (error) {
    items.value = prev;
    const msg = (error as { data?: { error?: string } })?.data?.error;
    toast.error(msg || "更新失败");
  }
}

function requestDelete(id: string) {
  deleteTargetId.value = id;
}

async function confirmDelete() {
  const id = deleteTargetId.value;
  if (!id) return;
  isDeleting.value = true;

  const prev = items.value;
  items.value = items.value.filter((l) => l.id !== id);

  try {
    await $fetch(`/api/links/${id}`, { method: "DELETE" });
    toast.success("删除成功");
    notify("Link");
  } catch (error) {
    items.value = prev;
    const msg = (error as { data?: { error?: string } })?.data?.error;
    toast.error(msg || "删除失败");
  } finally {
    isDeleting.value = false;
    deleteTargetId.value = null;
  }
}
</script>
