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

    <div class="overflow-x-auto rounded-2xl border border-border bg-card">
      <table class="w-full min-w-[720px] border-collapse text-left">
        <thead class="bg-muted/50 text-xs font-medium text-muted-foreground">
          <tr>
            <!--
              列宽策略：只有「链接」列吃掉剩余宽度（w-full），
              其余列用 w-px + whitespace-nowrap 收缩到内容宽度，避免长文本把别的列挤变形。
            -->
            <th class="w-px whitespace-nowrap px-3 py-2.5">
              <UCheckbox :model-value="allSelected" @update:model-value="toggleAll" />
            </th>
            <th class="w-px whitespace-nowrap px-1 py-2.5" />
            <th class="w-full px-3 py-2.5">链接</th>
            <th class="hidden w-px whitespace-nowrap px-3 py-2.5 sm:table-cell">分类</th>
            <th v-if="isAdmin" class="hidden w-px whitespace-nowrap px-3 py-2.5 lg:table-cell">创建者</th>
            <th class="w-px whitespace-nowrap px-3 py-2.5">可见性</th>
            <th class="hidden w-px whitespace-nowrap px-3 py-2.5 md:table-cell">创建时间</th>
            <th class="w-px whitespace-nowrap px-3 py-2.5 text-right">操作</th>
          </tr>
        </thead>

        <VueDraggable
          v-if="!hasFilters"
          v-model="tableItems"
          tag="tbody"
          handle=".drag-handle"
          :animation="160"
          :disabled="!currentUserId"
          ghost-class="opacity-40"
          chosen-class="bg-primary/5"
          drag-class="shadow-lg"
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
            @delete="requestDelete(link)"
          />
        </tbody>
      </table>

      <!-- 加载态：骨架行，与最终表格行高一致，避免内容跳动 -->
      <div v-if="pending" class="space-y-2 p-3">
        <USkeleton v-for="i in 6" :key="i" class="h-11 w-full rounded-lg" />
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
      :ui="{ content: 'max-w-2xl' }"
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

    <ConfirmDialog
      :open="deleteOpen"
      title="删除链接"
      confirm-label="确认删除"
      :loading="deleting"
      :impact="deleteTarget ? [`将删除「${deleteTarget.title}」`] : []"
      irreversible
      @update:open="(v) => { if (!v) deleteTarget = null }"
      @confirm="confirmDelete"
    />

    <ConfirmDialog
      :open="batchDeleteOpen"
      title="批量删除"
      confirm-label="确认删除"
      :loading="deleting"
      :impact="[`将删除选中的 ${selectedCount} 个链接`]"
      irreversible
      @update:open="(v) => { if (!v) batchDeleteOpen = false }"
      @confirm="confirmBatchDelete"
    />

    <!--
      批量操作栏：固定在视口底部（sticky），长列表滚动时也始终可操作。
      与撤销条合并成一块，避免出现两条各自为政的提示区。
    -->
    <div
      v-if="selectedCount > 0 || undoBanner.open"
      class="sticky bottom-0 z-30 mt-4 space-y-2 rounded-2xl border border-border bg-card/95 p-3 shadow-lg shadow-black/5 backdrop-blur-md"
    >
      <div v-if="selectedCount > 0" class="flex flex-wrap items-center gap-2">
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
          <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" @click="clearSelection">
            取消选择
          </UButton>
        </div>
      </div>

      <div v-if="undoBanner.open" class="flex flex-wrap items-center gap-3 border-t border-border/60 pt-2">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-rotate-ccw" class="h-4 w-4" />
          <span class="text-sm text-foreground">{{ undoBanner.message }}</span>
        </div>
        <span class="text-xs text-muted-foreground">撤销剩余 {{ undoBanner.remainingSec }}s</span>
        <UButton
          size="xs"
          variant="soft"
          color="neutral"
          :disabled="undoBanner.undoing || undoBanner.remainingSec <= 0"
          :loading="undoBanner.undoing"
          @click="handleUndo"
        >
          撤销
        </UButton>
        <UButton size="xs" variant="ghost" color="neutral" @click="clearUndoBanner">
          关闭
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { VueDraggable } from "vue-draggable-plus";
import type { Category, Link as LinkType, LinkFormData, SessionUser } from "~~/shared/types";

definePageMeta({ middleware: "auth", layout: "dashboard" });

const requestFetch = useRequestFetch();
const toast = useAppToast();
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

function clearSelection() {
  selected.value = new Set();
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
      toast.success("链接已更新");
    } else {
      await $fetch("/api/links", { method: "POST", body: data });
      toast.success("链接已创建");
    }
    formOpen.value = false;
    await refreshLinks();
    notify("Link");
  } catch (error) {
    toast.error(errorMessage(error, "保存失败"));
  } finally {
    submitting.value = false;
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
    toast.success("链接已删除");
    deleteTarget.value = null;
    const next = new Set(selected.value);
    next.delete(link.id);
    selected.value = next;
    await refreshLinks();
    notify("Link");
  } catch (error) {
    toast.error(errorMessage(error, "删除失败"));
  } finally {
    deleting.value = false;
  }
}

const UNDO_WINDOW_MS = 10_000;

const undoBanner = ref({
  open: false,
  message: "",
  remainingSec: 0,
  undoing: false,
});

let undoAction: null | (() => Promise<void>);
let undoInterval: ReturnType<typeof setInterval> | null;

function clearUndoBanner() {
  undoAction = null;
  if (undoInterval) {
    clearInterval(undoInterval);
    undoInterval = null;
  }
  undoBanner.value.open = false;
  undoBanner.value.message = "";
  undoBanner.value.remainingSec = 0;
  undoBanner.value.undoing = false;
}

function showUndoBanner(message: string, onUndo: () => Promise<void>) {
  clearUndoBanner();
  undoBanner.value.open = true;
  undoBanner.value.message = message;
  undoBanner.value.remainingSec = Math.ceil(UNDO_WINDOW_MS / 1000);
  undoAction = onUndo;

  const startedAt = Date.now();
  undoInterval = setInterval(() => {
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, UNDO_WINDOW_MS - elapsed);
    undoBanner.value.remainingSec = Math.ceil(remaining / 1000);
    if (remaining <= 0) clearUndoBanner();
  }, 250);
}

async function handleUndo() {
  if (!undoBanner.value.open || undoBanner.value.undoing || !undoAction) return;
  undoBanner.value.undoing = true;
  try {
    await undoAction();
    clearUndoBanner();
  } catch {
    toast.error("撤销失败");
    undoBanner.value.undoing = false;
  }
}

/**
 * 批量撤销用的单条字段回写。
 *
 * 单独抽成函数：Nuxt 的 `$fetch` 对模板字面量路径会做深度类型推导，
 * 直接写在对象字面量的箭头函数里会触发 TS2321（类型比较栈过深）。
 */
async function putLinkField(id: string, body: Record<string, unknown>): Promise<void> {
  const path = `/api/links/${id}`;
  await $fetch(path, { method: "PUT", body });
}

async function batchApplyWithUndo<TSnapshot>(opts: {
  label: string;
  patch: (link: LinkType) => Record<string, unknown>;
  snapshot: (link: LinkType) => TSnapshot;
  restore: (id: string, snapshot: TSnapshot) => Promise<void>;
  undoMessage: string;
}) {
  const targets = displayed.value.filter((link) => selected.value.has(link.id));
  if (targets.length === 0) return;

  const snapshots = new Map<string, TSnapshot>();
  for (const link of targets) snapshots.set(link.id, opts.snapshot(link));

  let ok = 0;
  let failed = 0;
  const okIds: string[] = [];

  for (const link of targets) {
    try {
      await $fetch(`/api/links/${link.id}`, { method: "PUT", body: opts.patch(link) });
      ok += 1;
      okIds.push(link.id);
    } catch {
      failed += 1;
    }
  }

  if (ok > 0) toast.success(`${opts.label}成功 ${ok} 个`);
  if (failed > 0) toast.error(`${failed} 个操作失败（可能无权限）`);

  await refreshLinks();
  notify("Link");

  if (ok > 0) {
    showUndoBanner(opts.undoMessage, async () => {
      let restored = 0;
      let restoreFailed = 0;
      for (const id of okIds) {
        const snap = snapshots.get(id);
        if (!snap) continue;
        try {
          await opts.restore(id, snap);
          restored += 1;
        } catch {
          restoreFailed += 1;
        }
      }
      await refreshLinks();
      notify("Link");
      if (restored > 0) {
        toast.success(`撤销成功 ${restored} 个`);
      }
      if (restoreFailed > 0) {
        toast.error(`撤销失败 ${restoreFailed} 个（可能已被二次编辑）`);
      }
    });
  }
}

function batchVisibility(isPrivate: boolean) {
  const label = isPrivate ? "设为私有" : "设为公开";
  const undoMessage = `已完成：${label}。${Math.ceil(UNDO_WINDOW_MS / 1000)} 秒内可撤销`;

  void batchApplyWithUndo({
    label,
    undoMessage,
    patch: () => ({ isPrivate }),
    snapshot: (link) => ({ isPrivate: link.isPrivate }),
    restore: (id, snap) => putLinkField(id, { isPrivate: snap.isPrivate }),
  });
}

function batchPin(isPinned: boolean) {
  const label = isPinned ? "置顶" : "取消置顶";
  const undoMessage = `已完成：${label}。${Math.ceil(UNDO_WINDOW_MS / 1000)} 秒内可撤销`;

  void batchApplyWithUndo({
    label,
    undoMessage,
    patch: () => ({ isPinned }),
    snapshot: (link) => ({ isPinned: link.isPinned }),
    restore: (id, snap) => putLinkField(id, { isPinned: snap.isPinned }),
  });
}

function batchMove() {
  const categoryId = batchCategory.value;
  if (!categoryId) return;
  const undoMessage = `已完成：移动到新分类。${Math.ceil(UNDO_WINDOW_MS / 1000)} 秒内可撤销`;

  void batchApplyWithUndo({
    label: "移动",
    undoMessage,
    patch: () => ({ categoryId }),
    snapshot: (link) => ({ categoryId: link.categoryId }),
    restore: (id, snap) => putLinkField(id, { categoryId: snap.categoryId }),
  }).then(() => (batchCategory.value = ""));
}

const batchDeleteOpen = ref(false);

function requestBatchDelete() {
  if (selectedCount.value > 0) batchDeleteOpen.value = true;
}

async function confirmBatchDelete() {
  deleting.value = true;
  const targets = displayed.value.filter((link) => selected.value.has(link.id));
  const remaining = new Set(selected.value);

  type CreateSnapshot = {
    title: string;
    url: string;
    altUrl: string;
    description: string;
    favicon: string;
    categoryId: string;
    isPrivate: boolean;
    isPinned: boolean;
  };

  const snapshots = new Map<string, CreateSnapshot>();
  const successIds: string[] = [];
  let ok = 0;

  for (const link of targets) {
    snapshots.set(link.id, {
      title: link.title,
      url: link.url,
      altUrl: link.altUrl ?? "",
      description: link.description ?? "",
      favicon: link.favicon ?? "",
      categoryId: link.categoryId,
      isPrivate: link.isPrivate,
      isPinned: link.isPinned,
    });

    try {
      await $fetch(`/api/links/${link.id}`, { method: "DELETE" });
      remaining.delete(link.id);
      successIds.push(link.id);
      ok += 1;
    } catch {
      // 单个失败继续
    }
  }

  selected.value = remaining;
  deleting.value = false;
  batchDeleteOpen.value = false;
  toast.success(`已删除 ${ok} 个链接`);

  await refreshLinks();
  notify("Link");

  if (ok > 0) {
    showUndoBanner(`已完成：删除 ${ok} 个链接。${Math.ceil(UNDO_WINDOW_MS / 1000)} 秒内可撤销`, async () => {
      let restored = 0;
      let restoreFailed = 0;

      for (const id of successIds) {
        const snap = snapshots.get(id);
        if (!snap) continue;
        try {
          await $fetch("/api/links", {
            method: "POST",
            body: {
              title: snap.title,
              url: snap.url,
              altUrl: snap.altUrl,
              description: snap.description,
              favicon: snap.favicon,
              categoryId: snap.categoryId,
              isPrivate: snap.isPrivate,
              isPinned: snap.isPinned,
            },
          });
          restored += 1;
        } catch {
          restoreFailed += 1;
        }
      }

      await refreshLinks();
      notify("Link");

      if (restored > 0) toast.success(`撤销成功 ${restored} 个链接`);
      if (restoreFailed > 0) toast.error(`撤销失败 ${restoreFailed} 个（可能已存在重复链接）`);
    });
  }
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
    toast.success("排序已保存");
  } catch {
    toast.error("排序保存失败");
    await refreshLinks();
  }
}
</script>
