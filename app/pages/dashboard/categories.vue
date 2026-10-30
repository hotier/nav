<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-foreground font-display">分类管理</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          共 {{ topCategories.length }} 个顶级分类<span v-if="childCount"> · {{ childCount }} 个子分类</span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          variant="soft"
          color="neutral"
          icon="i-lucide-refresh-cw"
          :loading="pending"
          aria-label="刷新"
          @click="refreshCategories()"
        />
        <UButton icon="i-lucide-plus" @click="openCreate()">新增分类</UButton>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="搜索分类名称"
        class="w-full sm:w-64"
      />
      <USelect v-model="visibility" :items="visibilityItems" class="w-32" />
      <UButton
        v-if="search || visibility !== 'all'"
        variant="ghost"
        color="neutral"
        size="sm"
        icon="i-lucide-x"
        @click="search = ''; visibility = 'all'"
      >
        清除筛选
      </UButton>
    </div>

    <div class="overflow-x-auto rounded-xl border border-border">
      <table class="w-full min-w-[640px] border-collapse text-left">
        <thead class="bg-muted/50 text-xs font-medium text-muted-foreground">
          <tr>
            <th class="px-4 py-2.5">分类</th>
            <th class="px-3 py-2.5">链接数</th>
            <th v-if="isAdmin" class="hidden px-3 py-2.5 lg:table-cell">创建者</th>
            <th class="px-3 py-2.5">可见性</th>
            <th class="px-3 py-2.5 text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.id"
            class="border-b border-border/60 transition-colors hover:bg-muted/40"
          >
            <td class="px-4 py-3">
              <div class="flex items-center gap-2" :class="row.depth === 1 ? 'pl-7' : ''">
                <span
                  v-if="row.depth === 1"
                  class="h-3 w-3 rounded-bl border-b border-l border-border"
                  aria-hidden="true"
                />
                <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-primary">
                  <DynamicIcon :name="row.icon || 'Folder'" class-name="h-4 w-4" />
                </span>
                <div class="min-w-0">
                  <div class="truncate text-sm font-medium text-foreground">{{ row.name }}</div>
                  <div class="text-xs text-muted-foreground">
                    {{ row.depth === 0 ? "顶级分类" : "子分类" }}
                  </div>
                </div>
              </div>
            </td>
            <td class="px-3 py-3 text-sm text-muted-foreground">{{ row.linkCount }}</td>
            <td v-if="isAdmin" class="hidden px-3 py-3 text-xs text-muted-foreground lg:table-cell">
              {{ row.userId === currentUserId ? "我" : row.ownerName }}
            </td>
            <td class="px-3 py-3">
              <div class="flex flex-wrap items-center gap-1">
                <UBadge v-if="row.isHidden" color="error" variant="subtle" size="sm">已隐藏</UBadge>
                <UBadge :color="row.isPublic ? 'success' : 'warning'" variant="subtle" size="sm">
                  {{ row.isPublic ? "公开" : "私有" }}
                </UBadge>
              </div>
            </td>
            <td class="px-3 py-3">
              <div class="flex items-center justify-end gap-0.5">
                <UTooltip v-if="row.depth === 0 && canManage(row)" text="添加子分类">
                  <UButton
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    square
                    icon="i-lucide-plus"
                    aria-label="添加子分类"
                    @click="openCreate(row.id)"
                  />
                </UTooltip>
                <UTooltip v-if="canManage(row)" text="编辑">
                  <UButton
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    square
                    icon="i-lucide-pencil"
                    aria-label="编辑"
                    @click="openEdit(row)"
                  />
                </UTooltip>
                <UTooltip v-if="canManage(row)" text="删除">
                  <UButton
                    variant="ghost"
                    color="error"
                    size="xs"
                    square
                    icon="i-lucide-trash-2"
                    aria-label="删除"
                    @click="requestDelete(row)"
                  />
                </UTooltip>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="pending" class="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <UIcon name="i-lucide-loader-circle" class="mr-2 h-4 w-4 animate-spin" />
        加载中…
      </div>
      <EmptyState
        v-else-if="rows.length === 0"
        compact
        icon="i-lucide-folder-x"
        :title="search || visibility !== 'all' ? '没有符合条件的分类' : '还没有分类'"
        :description="search || visibility !== 'all' ? '调整筛选条件后重试' : '点击右上角「新增分类」开始整理书签'"
      />
    </div>

    <UModal
      v-model:open="formOpen"
      :title="editing ? '编辑分类' : '新增分类'"
      :ui="{ content: 'max-w-lg' }"
    >
      <template #body>
        <form class="space-y-4" @submit.prevent="handleSubmit">
          <UFormField label="分类名称" required>
            <UInput v-model="form.name" placeholder="如：开发工具" maxlength="20" class="w-full" />
          </UFormField>

          <UFormField label="图标">
            <IconPicker v-model="form.icon" />
          </UFormField>

          <UFormField label="上级分类">
            <USelect
              v-model="form.parentId"
              :items="parentItems"
              :disabled="parentLocked"
              class="w-full"
            />
            <p v-if="parentLocked" class="mt-1 text-xs text-muted-foreground">
              该分类已有子分类，不能移动到其他层级
            </p>
          </UFormField>

          <div class="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-medium text-foreground">公开分类</p>
                <p class="text-xs text-muted-foreground">所有登录用户都可以看到并向其中添加链接</p>
              </div>
              <USwitch v-model="form.isPublic" />
            </div>
            <div v-if="isAdmin && editing" class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-medium text-foreground">管理员隐藏</p>
                <p class="text-xs text-muted-foreground">隐藏后普通用户不可见，仅管理员可管理</p>
              </div>
              <USwitch v-model="form.isHidden" />
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" color="neutral" @click="formOpen = false">取消</UButton>
            <UButton type="submit" :loading="submitting">
              {{ editing ? "保存修改" : "创建分类" }}
            </UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="deleteOpen" title="删除分类">
      <template #body>
        <p class="text-sm text-muted-foreground">
          确定要删除「{{ deleteTarget?.name }}」吗？
          <span class="mt-1 block text-error">分类下的链接会一并删除，此操作不可撤销。</span>
        </p>
        <p v-if="deleteTarget?.childCount" class="mt-2 text-xs text-warning">
          其中包含 {{ deleteTarget.childCount }} 个子分类，会一并删除。
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="deleteOpen = false">取消</UButton>
          <UButton color="error" :loading="deleting" @click="confirmDelete">确认删除</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { Category, SessionUser } from "~~/shared/types";

definePageMeta({ middleware: "auth", layout: "dashboard" });

interface RowCategory extends Category {
  depth: 0 | 1;
  linkCount: number;
  childCount: number;
  ownerName: string;
}

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

const { data: categories, status } = useQuery({
  key: qk.manageCategories(),
  query: () =>
    withFallback(
      requestFetch<Category[]>("/api/categories?scope=manage&forSelector=true"),
      [] as Category[],
    ),
});
const pending = computed(() => status.value === "pending");
const refreshCategories = () => queryCache.invalidateQueries({ key: ["categories"] });

const topCategories = computed(() => (categories.value ?? []).filter((category) => !category.parentId));
const childCount = computed(() =>
  topCategories.value.reduce((sum, category) => sum + (category.children?.length ?? 0), 0),
);

const search = ref("");
const visibility = ref("all");

const visibilityItems = [
  { label: "全部可见性", value: "all" },
  { label: "公开", value: "public" },
  { label: "私有", value: "private" },
  { label: "已隐藏", value: "hidden" },
];

function matches(category: Category): boolean {
  const keyword = search.value.trim().toLowerCase();
  if (keyword && !category.name.toLowerCase().includes(keyword)) return false;
  if (visibility.value === "public" && !category.isPublic) return false;
  if (visibility.value === "private" && (category.isPublic || category.isHidden)) return false;
  if (visibility.value === "hidden" && !category.isHidden) return false;
  return true;
}

const rows = computed<RowCategory[]>(() => {
  const result: RowCategory[] = [];
  for (const category of topCategories.value) {
    const children = category.children ?? [];
    const parentMatch = matches(category);
    const visibleChildren = parentMatch
      ? children
      : children.filter((child) => matches(child));

    if (!parentMatch && visibleChildren.length === 0) continue;

    result.push({
      ...category,
      depth: 0,
      linkCount: category.links?.length ?? 0,
      childCount: children.length,
      ownerName: category.user?.name || category.user?.username || "—",
    });

    for (const child of visibleChildren) {
      result.push({
        ...child,
        depth: 1,
        linkCount: child.links?.length ?? 0,
        childCount: 0,
        ownerName: (category.user?.name || category.user?.username || "—"),
      });
    }
  }
  return result;
});

function canManage(category: RowCategory): boolean {
  if (category.isHidden && !isAdmin.value) return false;
  if (isAdmin.value) return category.isPublic || category.userId === currentUserId.value;
  return category.userId === currentUserId.value;
}

const formOpen = ref(false);
const submitting = ref(false);
const editing = ref<RowCategory | null>(null);
const form = reactive({
  name: "",
  icon: "Folder",
  parentId: "root",
  isPublic: false,
  isHidden: false,
});

const parentItems = computed(() => {
  const options = topCategories.value
    .filter((category) => category.id !== editing.value?.id)
    .map((category) => ({ label: category.name, value: category.id }));
  return [{ label: "无（顶级分类）", value: "root" }, ...options];
});

const parentLocked = computed(() => {
  const target = editing.value;
  if (!target) return false;
  if (target.depth === 1) return false;
  return (target.childCount ?? 0) > 0;
});

function openCreate(parentId?: string) {
  editing.value = null;
  form.name = "";
  form.icon = "Folder";
  form.parentId = parentId ?? "root";
  form.isPublic = false;
  form.isHidden = false;
  formOpen.value = true;
}

function openEdit(category: RowCategory) {
  editing.value = category;
  form.name = category.name;
  form.icon = category.icon || "Folder";
  form.parentId = category.parentId ?? "root";
  form.isPublic = category.isPublic;
  form.isHidden = category.isHidden;
  formOpen.value = true;
}

function errorMessage(error: unknown, fallback: string): string {
  return (error as { data?: { error?: string } })?.data?.error || fallback;
}

async function handleSubmit() {
  if (!form.name.trim()) {
    toast.add({ title: "请输入分类名称", color: "error" });
    return;
  }

  submitting.value = true;
  try {
    const body = {
      name: form.name,
      icon: form.icon || null,
      parentId: form.parentId === "root" ? null : form.parentId,
      isPublic: form.isPublic,
      ...(isAdmin.value && editing.value ? { isHidden: form.isHidden } : {}),
    };

    if (editing.value) {
      await $fetch(`/api/categories/${editing.value.id}`, { method: "PUT", body });
      toast.add({ title: "分类已更新", icon: "i-lucide-check" });
    } else {
      await $fetch("/api/categories", { method: "POST", body });
      toast.add({ title: "分类已创建", icon: "i-lucide-check" });
    }

    formOpen.value = false;
    await refreshCategories();
    notify("Category");
  } catch (error) {
    toast.add({ title: errorMessage(error, "保存失败"), color: "error" });
  } finally {
    submitting.value = false;
  }
}

const deleteTarget = ref<RowCategory | null>(null);
const deleteOpen = computed({
  get: () => !!deleteTarget.value,
  set: (value: boolean) => {
    if (!value) deleteTarget.value = null;
  },
});
const deleting = ref(false);

function requestDelete(category: RowCategory) {
  deleteTarget.value = category;
}

async function confirmDelete() {
  const category = deleteTarget.value;
  if (!category) return;
  deleting.value = true;
  try {
    await $fetch(`/api/categories/${category.id}`, { method: "DELETE" });
    toast.add({ title: "分类已删除", icon: "i-lucide-check" });
    deleteTarget.value = null;
    await refreshCategories();
    notify("Category");
  } catch (error) {
    toast.add({ title: errorMessage(error, "删除失败"), color: "error" });
  } finally {
    deleting.value = false;
  }
}
</script>
