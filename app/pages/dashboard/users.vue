<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-foreground font-display">用户管理</h1>
        <p class="mt-1 text-sm text-muted-foreground">共 {{ filteredRows.length }} 个用户<span v-if="search || roleFilter !== 'all'"> · 全部 {{ userRows.length }} 个</span></p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          variant="soft"
          color="neutral"
          icon="i-lucide-refresh-cw"
          :loading="pending"
          aria-label="刷新"
          @click="refreshUsers()"
        />
        <UButton icon="i-lucide-user-plus" @click="openCreate">新建用户</UButton>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="搜索用户名、邮箱或显示名称"
        class="w-full sm:w-72"
      />
      <USelect v-model="roleFilter" :items="roleFilterItems" class="w-36" />
      <UButton
        v-if="search || roleFilter !== 'all'"
        variant="ghost"
        color="neutral"
        size="sm"
        icon="i-lucide-x"
        @click="search = ''; roleFilter = 'all'"
      >
        清除筛选
      </UButton>
    </div>

    <div class="overflow-x-auto rounded-2xl border border-border bg-card">
      <table class="w-full min-w-[720px] border-collapse text-left">
        <thead class="bg-muted/50 text-xs font-medium text-muted-foreground">
          <tr>
            <!-- 列宽策略与链接/分类管理页一致：用户列吃剩余宽度，其余列收缩到内容宽度 -->
            <th class="w-full px-4 py-2.5">用户</th>
            <th class="w-px whitespace-nowrap px-3 py-2.5">角色</th>
            <th class="w-px whitespace-nowrap px-3 py-2.5 text-right">链接数</th>
            <th class="hidden w-px whitespace-nowrap px-3 py-2.5 md:table-cell">注册时间</th>
            <th class="w-px whitespace-nowrap px-3 py-2.5 text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in filteredRows"
            :key="row.id"
            class="border-b border-border/60 transition-colors hover:bg-muted/40"
          >
            <td class="w-full min-w-0 px-4 py-3">
              <div class="flex min-w-0 items-center gap-3">
                <UAvatar
                  :src="row.image ? proxyImageUrl(row.image, 96) : undefined"
                  :alt="row.name || row.username || 'U'"
                  size="sm"
                  class="shrink-0"
                />
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5">
                    <span class="truncate text-sm font-medium text-foreground">{{ row.name || row.username || "未命名" }}</span>
                    <UBadge v-if="row.id === currentUserId" size="sm" color="primary" variant="subtle">我</UBadge>
                  </div>
                  <p class="truncate text-xs text-muted-foreground">
                    {{ row.username ? `@${row.username}` : "" }}{{ row.username && row.email ? " · " : "" }}{{ row.email || "" }}
                  </p>
                </div>
              </div>
            </td>
            <td class="w-px whitespace-nowrap px-3 py-3">
              <div class="flex flex-wrap items-center gap-1">
                <UBadge :color="row.role === 'admin' ? 'primary' : 'neutral'" variant="subtle" size="sm">
                  {{ row.role === "admin" ? "管理员" : "普通用户" }}
                </UBadge>
                <UBadge v-if="row.isSystemAdmin" color="warning" variant="subtle" size="sm">系统</UBadge>
              </div>
            </td>
            <td class="w-px whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-muted-foreground">
              {{ row._count?.links ?? 0 }}
            </td>
            <td class="hidden w-px whitespace-nowrap px-3 py-3 text-xs tabular-nums text-muted-foreground md:table-cell">
              {{ formatDate(row.createdAt) }}
            </td>
            <td class="w-px whitespace-nowrap px-3 py-3 text-right">
              <UDropdownMenu :items="rowMenu(row)" :content="{ align: 'end' }">
                <UButton
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  square
                  icon="i-lucide-ellipsis-vertical"
                  aria-label="用户操作"
                />
              </UDropdownMenu>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 加载态：骨架行，与最终表格行高一致，避免内容跳动 -->
      <div v-if="pending" class="space-y-2 p-3">
        <USkeleton v-for="i in 6" :key="i" class="h-11 w-full rounded-lg" />
      </div>
      <EmptyState
        v-else-if="filteredRows.length === 0"
        compact
        icon="i-lucide-users"
        :title="search || roleFilter !== 'all' ? '没有符合条件的用户' : '还没有用户'"
        :description="search || roleFilter !== 'all' ? '调整筛选条件后重试' : ''"
      />
    </div>

    <UModal v-model:open="createOpen" title="新建用户" :ui="{ content: 'max-w-lg' }">
      <template #body>
        <form class="space-y-4" @submit.prevent="handleCreate">
          <UFormField label="用户名" required>
            <UInput v-model="createForm.username" placeholder="仅字母、数字和连字符" class="w-full" />
          </UFormField>
          <UFormField label="显示名称">
            <UInput v-model="createForm.name" placeholder="可选，默认与用户名相同" class="w-full" />
          </UFormField>
          <UFormField label="邮箱" required>
            <UInput v-model="createForm.email" type="email" placeholder="name@example.com" class="w-full" />
          </UFormField>
          <UFormField label="密码" required>
            <div class="flex gap-2">
              <UInput v-model="createForm.password" placeholder="至少 6 位" class="flex-1" />
              <UButton variant="soft" color="neutral" icon="i-lucide-dices" @click="createForm.password = randomPassword()">
                生成
              </UButton>
            </div>
          </UFormField>
          <UFormField label="角色">
            <USelect v-model="createForm.role" :items="roleItems" class="w-full" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" color="neutral" @click="createOpen = false">取消</UButton>
            <UButton type="submit" :loading="submitting">创建用户</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="resetOpen" title="重置密码" :ui="{ content: 'max-w-md' }">
      <template #body>
        <form class="space-y-4" @submit.prevent="handleReset">
          <p class="text-sm text-muted-foreground">
            为目标用户「{{ resetTarget?.name || resetTarget?.username }}」设置新密码，原密码立即失效。
          </p>
          <UFormField label="新密码" required>
            <div class="flex gap-2">
              <UInput v-model="newPassword" placeholder="至少 6 位" class="flex-1" />
              <UButton variant="soft" color="neutral" icon="i-lucide-dices" @click="newPassword = randomPassword()">
                生成
              </UButton>
            </div>
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" color="neutral" @click="resetOpen = false">取消</UButton>
            <UButton type="submit" :loading="submitting">重置密码</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <ConfirmDialog
      :open="deleteOpen"
      title="删除用户"
      confirm-label="确认删除"
      :loading="submitting"
      :impact="deleteImpact"
      irreversible
      @update:open="(v) => { if (!v) deleteTarget = null }"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { SessionUser } from "~~/shared/types";

definePageMeta({ middleware: ["auth", "admin"], layout: "dashboard" });

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  username: string | null;
  image: string | null;
  role: string;
  isSystemAdmin: boolean;
  createdAt: string;
  _count?: { links: number };
}

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

const { data: users, status } = useQuery({
  key: qk.users(),
  query: () => withFallback(requestFetch<UserRow[]>("/api/users"), [] as UserRow[]),
});
const pending = computed(() => status.value === "pending");
const refreshUsers = () => queryCache.invalidateQueries({ key: ["users"] });

const userRows = computed(() => users.value ?? []);
const submitting = ref(false);

const search = ref("");
const roleFilter = ref("all");

const roleFilterItems = [
  { label: "全部角色", value: "all" },
  { label: "管理员", value: "admin" },
  { label: "普通用户", value: "user" },
];

/** 用户列表过滤：关键词命中用户名/邮箱/显示名，角色下拉单独过滤 */
const filteredRows = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  return userRows.value.filter((row) => {
    if (roleFilter.value !== "all" && row.role !== roleFilter.value) return false;
    if (!keyword) return true;
    const haystack = `${row.name ?? ""} ${row.username ?? ""} ${row.email ?? ""}`.toLowerCase();
    return haystack.includes(keyword);
  });
});

const roleItems = [
  { label: "普通用户", value: "user" },
  { label: "管理员", value: "admin" },
];

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}

function errorMessage(error: unknown, fallback: string): string {
  return (error as { data?: { error?: string } })?.data?.error || fallback;
}

function randomPassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => chars[value % chars.length]).join("");
}

const createOpen = ref(false);
const createForm = reactive({
  username: "",
  name: "",
  email: "",
  password: "",
  role: "user",
});

function openCreate() {
  createForm.username = "";
  createForm.name = "";
  createForm.email = "";
  createForm.password = randomPassword();
  createForm.role = "user";
  createOpen.value = true;
}

async function handleCreate() {
  submitting.value = true;
  try {
    await $fetch("/api/users", {
      method: "POST",
      body: {
        username: createForm.username.trim(),
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        role: createForm.role,
      },
    });
    toast.success("用户已创建");
    createOpen.value = false;
    await refreshUsers();
    notify("User");
  } catch (error) {
    toast.error(errorMessage(error, "创建失败"));
  } finally {
    submitting.value = false;
  }
}

async function changeRole(row: UserRow, role: "admin" | "user") {
  try {
    await $fetch(`/api/users/${row.id}`, { method: "PATCH", body: { role } });
    toast.success(role === "admin" ? "已设为管理员" : "已设为普通用户");
    await refreshUsers();
    notify("User");
  } catch (error) {
    toast.error(errorMessage(error, "操作失败"));
  }
}

const resetOpen = ref(false);
const resetTarget = ref<UserRow | null>(null);
const newPassword = ref("");

function openReset(row: UserRow) {
  resetTarget.value = row;
  newPassword.value = randomPassword();
  resetOpen.value = true;
}

async function handleReset() {
  const target = resetTarget.value;
  if (!target) return;
  submitting.value = true;
  try {
    await $fetch(`/api/users/${target.id}`, { method: "PATCH", body: { password: newPassword.value } });
    toast.success(`已重置 ${target.name || target.username} 的密码`);
    resetOpen.value = false;
    notify("User");
  } catch (error) {
    toast.error(errorMessage(error, "重置失败"));
  } finally {
    submitting.value = false;
  }
}

const deleteTarget = ref<UserRow | null>(null);
const deleteOpen = computed({
  get: () => !!deleteTarget.value,
  set: (value: boolean) => {
    if (!value) deleteTarget.value = null;
  },
});
/** 删除影响范围：用户身份 + 归属数据量，逐条列出 */
const deleteImpact = computed(() => {
  const target = deleteTarget.value;
  if (!target) return [];
  const label = target.name || target.username || target.email || target.id;
  const items = [`将删除用户「${label}」`];
  const linkCount = target._count?.links ?? 0;
  if (linkCount > 0) items.push(`该用户的 ${linkCount} 个链接会一并删除`);
  items.push("该用户创建的分类会一并删除");
  if (target.isSystemAdmin) items.push("该账号是系统管理员");
  return items;
});

function requestDelete(row: UserRow) {
  deleteTarget.value = row;
}

async function confirmDelete() {
  const target = deleteTarget.value;
  if (!target) return;
  submitting.value = true;
  try {
    await $fetch(`/api/users/${target.id}`, { method: "DELETE" });
    toast.success("用户已删除");
    deleteTarget.value = null;
    await refreshUsers();
    notify("User");
  } catch (error) {
    toast.error(errorMessage(error, "删除失败"));
  } finally {
    submitting.value = false;
  }
}

function rowMenu(row: UserRow): DropdownMenuItem[][] {
  const items: DropdownMenuItem[][] = [];

  if (row.role === "admin") {
    items.push([
      {
        label: "设为普通用户",
        icon: "i-lucide-user-round",
        disabled: row.isSystemAdmin,
        onSelect: () => changeRole(row, "user"),
      },
    ]);
  } else {
    items.push([
      {
        label: "设为管理员",
        icon: "i-lucide-shield",
        onSelect: () => changeRole(row, "admin"),
      },
    ]);
  }

  items.push([
    { label: "重置密码", icon: "i-lucide-key-round", onSelect: () => openReset(row) },
  ]);

  if (!row.isSystemAdmin && row.id !== currentUserId.value) {
    items.push([
      {
        label: "删除用户",
        icon: "i-lucide-trash-2",
        color: "error",
        onSelect: () => requestDelete(row),
      },
    ]);
  }

  return items;
}
</script>
