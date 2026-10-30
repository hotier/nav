<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-foreground font-display">链接管理</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          共 {{ total }} 个链接<span v-if="hasFilters"> · 筛选出 {{ displayed.length }} 个</span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          variant="soft"
          color="neutral"
          icon="i-lucide-refresh-cw"
          :loading="pending"
          aria-label="刷新"
          @click="refreshLinks()"
        />
        <UButton icon="i-lucide-plus" @click="openCreate">新增链接</UButton>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="搜索标题、网址或分类"
        class="w-full sm:w-64"
      />
      <USelect v-model="categoryFilter" :items="categoryFilterItems" class="w-40" />
      <USelect v-model="visibility" :items="visibilityItems" class="w-32" />
      <USelect v-model="sort" :items="sortItems" class="w-36" />
      <UButton
        v-if="hasFilters"
        variant="ghost"
        color="neutral"
        size="sm"
        icon="i-lucide-x"
        @click="resetFilters"
      >
        清除筛选
      </UButton>
    </div>

    <div
      v-if="selectedCount > 0"
      class="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2"
    >
      <span class="text-sm font-medium text-primary">已选择 {{ selectedCount }} 项</span>
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <UButton size="xs" variant="soft" color="success" icon="i-lucide-globe" @click="batchVisibility(false)">
          设为公开
        </UButton>
        <UButton size="xs" variant="soft" color="warning" icon="i-lucide-lock" @click="batchVisibility(true)">
          设为私有
        </UButton>
        <UButton size="xs" variant="soft" color="neutral" icon="i-lucide-pin" @click="batchPin(true)">
          置顶
        </UButton>
        <UButton size="xs" variant="soft" color="neutral" icon="i-lucide-pin-off" @click="batchPin(false)">
          取消置顶
        </UButton>
        <div class="flex items-center gap-1">
          <USelect v-model="batchCategory" :items="batchCategoryItems" placeholder="移动到分类" class="w-40" />
          <UButton
            size="xs"
            variant="soft"
            color="neutral"
            :disabled="!batchCategory"
            @click="batchMove"
          >
            移动
          </UButton>
        </div>
        <UButton size="xs" variant="soft" color="error" icon="i-lucide-trash-2" @click="requestBatchDelete">
          删除
        </UButton>
      </div>
    </div>

    <div class="overflow-x-auto rounded-xl border border-border">
      <table class="w-full min-w-[720px] border-collapse text-left">
        <thead class="bg-muted/50 text-xs font-medium text-muted-foreground">
          <tr>
            <th class="w-10 px-3 py-2.5">
              <UCheckbox :model-value="allSelected" @update:model-value="toggleAll" />
            </th>
            <th class="w-8 px-1 py-2.5" />
            <th class="px-3 py-2.5">链接</th>
            <th class="hidden px-3 py-2.5 sm:table-cell">分类</th>
            <th v-if="isAdmin" class="hidden px-3 py-2.5 lg:table-cell">创建者</th>
            <th class="px-3 py-2.5">可见性</th>
            <th class="hidden px-3 py-2.5 md:table-cell">创建时间</th>
            <th class="px-3 py-2.5 text-right">操作</th>
          </tr>
        </thead>

        <VueDraggable
          v-if="!hasFilters"
          v-model="tableItems"
          tag="tbody"
          handle=".drag-handle"
          :animation="160"
          :disabled="!currentUserId"
          @end="persistOrder"
        >
          <DashboardLinkRow
            v-for="link in tableItems"
            :key="link.id"
            :link="link"
            :selected="selected.has(link.id)"
            :draggable="true"
            :is-admin="isAdmin"
            :current-user-id="currentUserId"
            @toggle="toggle(link.id)"
            @edit="openEdit(link)"
            @pin="togglePin(link)"
            @delete="requestDelete(link)"
          />
        </VueDraggable>

        <tbody v-else>
          <DashboardLinkRow
            v-for="link in displayed"
            :key="link.id"
            :link="link"
            :selected="selected.has(link.id)"
            :draggable="false"
            :is-admin="isAdmin"
            :current-user-id="currentUserId"
            @toggle="toggle(link.id)"
            @edit="openEdit(link)"
            @pin="togglePin(link)"
            @delete="requestDelete(link)"
          />
        </tbody>
      </table>

      <div v-if="pending" class="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <UIcon name="i-lucide-loader-circle" class="mr-2 h-4 w-4 animate-spin" />
        加载中…
      </div>
      <EmptyState
        v-else-if="displayed.length === 0"
        compact
        icon="i-lucide-bookmark-x"
        :title="hasFilters ? '没有符合条件的链接' : '还没有链接'"
        :description="hasFilters ? '调整筛选条件后重试' : '点击右上角「新增链接」开始添加'"
      />
    </div>

    <UModal
      v-model:open="formOpen"
      :title="editingLink ? '编辑链接' : '新增链接'"
      :ui="{ content: 'max-w-xl' }"
    >
      <template #body>
        <LinkForm
          :key="editingLink?.id || 'new'"
          :initial-data="initialFormData"
          :categories="flatCategories"
          :is-submitting="submitting"
          :is-edit="!!editingLink"
          :submit-label="editingLink ? '保存修改' : '创建链接'"
          @submit="handleSubmit"
          @cancel="formOpen = false"
        />
      </template>
    </UModal>

    <UModal v-model:open="deleteOpen" title="删除链接">
      <template #body>
        <p class="text-sm text-muted-foreground">
          确定要删除「{{ deleteTarget?.title }}」吗？
          <span class="mt-1 block text-error">此操作不可撤销。</span>
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="deleteOpen = false">取消</UButton>
          <UButton color="error" :loading="deleting" @click="confirmDelete">确认删除</UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="batchDeleteOpen" title="批量删除">
      <template #body>
        <p class="text-sm text-muted-foreground">
          确定要删除选中的 {{ selectedCount }} 个链接吗？
          <span class="mt-1 block text-error">此操作不可撤销。</span>
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="batchDeleteOpen = false">取消</UButton>
          <UButton color="error" :loading="deleting" @click="confirmBatchDelete">确认删除</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { VueDraggable } from "vue-draggable-plus";
import type { Category, Link as LinkType, LinkFormData, SessionUser } from "~~/shared/types";

definePageMeta({ middleware: "auth", layout: "dashboard" });

const requestFetch = useRequestFetch();
const toast = useToast();
const { notify } = useDataSync();

const queryCache = useQueryCache();

const { data: sessionData } = useQuery({
  key: qk.session(),
  query: () =>
    withFallback(
      requestFetch<{ user: SessionUser | null }>("/api/auth/session"),
      { user: null },
    ),
});

const currentUserId = computed(() => sessionData.value?.user?.id ?? "");
const isAdmin = computed(() => sessionData.value?.user?.role === "admin");

const { data: linkData, status } = useQuery({
  key: qk.manageLinks(),
  query: () =>
    withFallback(
      requestFetch<{ data: LinkType[]; total: number }>(
        "/api/links?page=1&pageSize=1000&scope=manage&sort=recent",
      ),
      { data: [], total: 0 },
    ),
});
const pending = computed(() => status.value === "pending");
const refreshLinks = () => queryCache.invalidateQueries({ key: ["links"] });

const { data: categoryData } = useQuery({
  key: qk.manageCategories(),
  query: () =>
    withFallback(
      requestFetch<Category[]>("/api/categories?scope=manage&forSelector=true"),
      [] as Category[],
    ),
});

const items = computed<LinkType[]>(() => linkData.value?.data ?? []);
const total = computed(() => linkData.value?.total ?? items.value.length);

const topCategories = computed(() => (categoryData.value ?? []).filter((category) => !category.parentId));

const flatCategories = computed(() =>
  topCategories.value.flatMap((category) => [
    { id: category.id, name: category.name },
    ...(category.children ?? []).map((child) => ({ id: child.id, name: `${category.name} / ${child.name}` })),
  ]),
);

const search = ref("");
const categoryFilter = ref("all");
const visibility = ref("all");
const sort = ref("recent");
const batchCategory = ref("");

const hasFilters = computed(
  () => !!search.value.trim() || categoryFilter.value !== "all" || visibility.value !== "all",
);

const categoryFilterItems = computed(() => [
  { label: "全部分类", value: "all" },
  ...flatCategories.value.map((category) => ({ label: category.name, value: category.id })),
]);

const batchCategoryItems = computed(() =>
  flatCategories.value.map((category) => ({ label: category.name, value: category.id })),
);

const visibilityItems = [
  { label: "全部可见性", value: "all" },
  { label: "仅公开", value: "public" },
  { label: "仅私有", value: "private" },
];

const sortItems = [
  { label: "最近创建", value: "recent" },
  { label: "手动排序", value: "order" },
];

const displayed = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  const list = items.value.filter((link) => {
    if (keyword) {
      const haystack = `${link.title} ${link.url} ${link.description ?? ""} ${link.category?.name ?? ""}`;
      if (!haystack.toLowerCase().includes(keyword)) return false;
    }
    if (categoryFilter.value !== "all" && link.categoryId !== categoryFilter.value) return false;
    if (visibility.value === "public" && (link.isPrivate || link.isHidden)) return false;
    if (visibility.value === "private" && !link.isPrivate) return false;
    return true;
  });

  const pinnedFirst = (list: LinkType[]) =>
    [...list].sort((a, b) => Number(b.isPinned) - Number(a.isPinned));

  if (sort.value === "order") {
    return pinnedFirst(list).sort((a, b) => {
      if (a.isPinned !== b.isPinned) return Number(b.isPinned) - Number(a.isPinned);
      return a.sortOrder - b.sortOrder;
    });
  }
  return pinnedFirst(list).sort((a, b) => {
    if (a.isPinned !== b.isPinned) return Number(b.isPinned) - Number(a.isPinned);
    return +new Date(b.createdAt) - +new Date(a.createdAt);
  });
});

const tableItems = ref<LinkType[]>([]);
watch(displayed, (list) => (tableItems.value = [...list]), { immediate: true });

const selected = ref<Set<string>>(new Set());
const selectedCount = computed(() => selected.value.size);

const allSelected = computed(
  () => displayed.value.length > 0 && displayed.value.every((link) => selected.value.has(link.id)),
);

function toggle(id: string) {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}

function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(displayed.value.map((link) => link.id));
}

function resetFilters() {
  search.value = "";
  categoryFilter.value = "all";
  visibility.value = "all";
  sort.value = "recent";
}

function errorMessage(error: unknown, fallback: string): string {
  return (error as { data?: { error?: string } })?.data?.error || fallback;
}

const formOpen = ref(false);
const editingLink = ref<LinkType | null>(null);
const submitting = ref(false);

const initialFormData = computed<Partial<LinkFormData> | undefined>(() => {
  const link = editingLink.value;
  if (!link) return undefined;
  return {
    title: link.title,
    url: link.url,
    altUrl: link.altUrl ?? "",
    description: link.description ?? "",
    favicon: link.favicon ?? "",
    categoryId: link.categoryId,
    isPrivate: link.isPrivate,
    isPinned: link.isPinned,
  };
});

function openCreate() {
  editingLink.value = null;
  formOpen.value = true;
}

function openEdit(link: LinkType) {
  editingLink.value = link;
  formOpen.value = true;
}

async function handleSubmit(data: LinkFormData) {
  submitting.value = true;
  try {
    if (editingLink.value) {
      await $fetch(`/api/links/${editingLink.value.id}`, { method: "PUT", body: data });
      toast.add({ title: "链接已更新", icon: "i-lucide-check" });
    } else {
      await $fetch("/api/links", { method: "POST", body: data });
      toast.add({ title: "链接已创建", icon: "i-lucide-check" });
    }
    formOpen.value = false;
    await refreshLinks();
    notify("Link");
  } catch (error) {
    toast.add({ title: errorMessage(error, "保存失败"), color: "error", icon: "i-lucide-x" });
  } finally {
    submitting.value = false;
  }
}

async function togglePin(link: LinkType) {
  try {
    await $fetch(`/api/links/${link.id}`, {
      method: "PUT",
      body: { isPinned: !link.isPinned },
    });
    await refreshLinks();
    notify("Link");
  } catch (error) {
    toast.add({ title: errorMessage(error, "操作失败"), color: "error" });
  }
}

const deleteTarget = ref<LinkType | null>(null);
const deleteOpen = computed({
  get: () => !!deleteTarget.value,
  set: (value: boolean) => {
    if (!value) deleteTarget.value = null;
  },
});
const deleting = ref(false);

function requestDelete(link: LinkType) {
  deleteTarget.value = link;
}

async function confirmDelete() {
  const link = deleteTarget.value;
  if (!link) return;
  deleting.value = true;
  try {
    await $fetch(`/api/links/${link.id}`, { method: "DELETE" });
    toast.add({ title: "链接已删除", icon: "i-lucide-check" });
    deleteTarget.value = null;
    const next = new Set(selected.value);
    next.delete(link.id);
    selected.value = next;
    await refreshLinks();
    notify("Link");
  } catch (error) {
    toast.add({ title: errorMessage(error, "删除失败"), color: "error" });
  } finally {
    deleting.value = false;
  }
}

async function batchApply(patch: (link: LinkType) => Record<string, unknown>, label: string) {
  const targets = displayed.value.filter((link) => selected.value.has(link.id));
  let ok = 0;
  let failed = 0;
  for (const link of targets) {
    try {
      await $fetch(`/api/links/${link.id}`, { method: "PUT", body: patch(link) });
      ok += 1;
    } catch {
      failed += 1;
    }
  }
  if (ok > 0) toast.add({ title: `${label}成功 ${ok} 个`, icon: "i-lucide-check" });
  if (failed > 0) toast.add({ title: `${failed} 个操作失败（可能无权限）`, color: "error" });
  await refreshLinks();
  notify("Link");
}

function batchVisibility(isPrivate: boolean) {
  void batchApply(() => ({ isPrivate }), isPrivate ? "设为私有" : "设为公开");
}

function batchPin(isPinned: boolean) {
  void batchApply(() => ({ isPinned }), isPinned ? "置顶" : "取消置顶");
}

function batchMove() {
  const categoryId = batchCategory.value;
  if (!categoryId) return;
  void batchApply(() => ({ categoryId }), "移动").then(() => (batchCategory.value = ""));
}

const batchDeleteOpen = ref(false);

function requestBatchDelete() {
  if (selectedCount.value > 0) batchDeleteOpen.value = true;
}

async function confirmBatchDelete() {
  deleting.value = true;
  const targets = displayed.value.filter((link) => selected.value.has(link.id));
  const remaining = new Set(selected.value);
  let ok = 0;
  for (const link of targets) {
    try {
      await $fetch(`/api/links/${link.id}`, { method: "DELETE" });
      remaining.delete(link.id);
      ok += 1;
    } catch {
      // 单个失败继续
    }
  }
  selected.value = remaining;
  deleting.value = false;
  batchDeleteOpen.value = false;
  toast.add({ title: `已删除 ${ok} 个链接`, icon: "i-lucide-check" });
  await refreshLinks();
  notify("Link");
}

async function persistOrder() {
  const pinnedCount = tableItems.value.filter((link) => link.isPinned).length;
  let pinnedIndex = 0;
  let unpinnedIndex = pinnedCount;
  const updates = tableItems.value.map((link) => ({
    id: link.id,
    sortOrder: link.isPinned ? pinnedIndex++ : unpinnedIndex++,
  }));

  try {
    await $fetch("/api/links/reorder", { method: "PUT", body: { updates } });
    notify("Link");
    toast.add({ title: "排序已保存", icon: "i-lucide-check" });
  } catch {
    toast.add({ title: "排序保存失败", color: "error" });
    await refreshLinks();
  }
}
</script>
