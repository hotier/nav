<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-foreground font-display">用户管理</h1>
        <p class="mt-1 text-sm text-muted-foreground">共 {{ userRows.length }} 个用户</p>
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

    <div class="overflow-x-auto rounded-xl border border-border">
      <table class="w-full min-w-[720px] border-collapse text-left">
        <thead class="bg-muted/50 text-xs font-medium text-muted-foreground">
          <tr>
            <th class="px-4 py-2.5">用户</th>
            <th class="px-3 py-2.5">角色</th>
            <th class="px-3 py-2.5">链接数</th>
            <th class="hidden px-3 py-2.5 md:table-cell">注册时间</th>
            <th class="px-3 py-2.5 text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in userRows"
            :key="row.id"
            class="border-b border-border/60 transition-colors hover:bg-muted/40"
          >
            <td class="px-4 py-3">
              <div class="flex items-center gap-3">
                <UAvatar
                  :src="row.image ? proxyImageUrl(row.image, 96) : undefined"
                  :alt="row.name || row.username || 'U'"
                  size="sm"
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
            <td class="px-3 py-3">
              <div class="flex flex-wrap items-center gap-1">
                <UBadge :color="row.role === 'admin' ? 'primary' : 'neutral'" variant="subtle" size="sm">
                  {{ row.role === "admin" ? "管理员" : "普通用户" }}
                </UBadge>
                <UBadge v-if="row.isSystemAdmin" color="warning" variant="subtle" size="sm">系统</UBadge>
              </div>
            </td>
            <td class="px-3 py-3 text-sm text-muted-foreground">{{ row._count?.links ?? 0 }}</td>
            <td class="hidden px-3 py-3 text-xs text-muted-foreground md:table-cell">
              {{ formatDate(row.createdAt) }}
            </td>
            <td class="px-3 py-3 text-right">
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

      <div v-if="pending" class="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <UIcon name="i-lucide-loader-circle" class="mr-2 h-4 w-4 animate-spin" />
        加载中…
      </div>
      <EmptyState v-else-if="userRows.length === 0" compact icon="i-lucide-users" title="还没有用户" />
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

    <UModal v-model:open="deleteOpen" title="删除用户">
      <template #body>
        <p class="text-sm text-muted-foreground">
          确定要删除用户「{{ deleteTarget?.name || deleteTarget?.username }}」吗？
          <span class="mt-1 block text-error">该用户的链接和分类会一并删除，此操作不可撤销。</span>
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="deleteOpen = false">取消</UButton>
          <UButton color="error" :loading="submitting" @click="confirmDelete">确认删除</UButton>
        </div>
      </template>
    </UModal>
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

const { data: users, status } = useQuery({
  key: qk.users(),
  query: () => withFallback(requestFetch<UserRow[]>("/api/users"), [] as UserRow[]),
});
const pending = computed(() => status.value === "pending");
const refreshUsers = () => queryCache.invalidateQueries({ key: ["users"] });

const userRows = computed(() => users.value ?? []);
const submitting = ref(false);

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
    toast.add({ title: "用户已创建", icon: "i-lucide-check" });
    createOpen.value = false;
    await refreshUsers();
    notify("User");
  } catch (error) {
    toast.add({ title: errorMessage(error, "创建失败"), color: "error" });
  } finally {
    submitting.value = false;
  }
}

async function changeRole(row: UserRow, role: "admin" | "user") {
  try {
    await $fetch(`/api/users/${row.id}`, { method: "PATCH", body: { role } });
    toast.add({ title: role === "admin" ? "已设为管理员" : "已设为普通用户", icon: "i-lucide-check" });
    await refreshUsers();
    notify("User");
  } catch (error) {
    toast.add({ title: errorMessage(error, "操作失败"), color: "error" });
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
    toast.add({ title: `已重置 ${target.name || target.username} 的密码`, icon: "i-lucide-check" });
    resetOpen.value = false;
    notify("User");
  } catch (error) {
    toast.add({ title: errorMessage(error, "重置失败"), color: "error" });
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

function requestDelete(row: UserRow) {
  deleteTarget.value = row;
}

async function confirmDelete() {
  const target = deleteTarget.value;
  if (!target) return;
  submitting.value = true;
  try {
    await $fetch(`/api/users/${target.id}`, { method: "DELETE" });
    toast.add({ title: "用户已删除", icon: "i-lucide-check" });
    deleteTarget.value = null;
    await refreshUsers();
    notify("User");
  } catch (error) {
    toast.add({ title: errorMessage(error, "删除失败"), color: "error" });
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
