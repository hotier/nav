<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-foreground font-display">账户管理</h1>
      <p class="mt-1 text-sm text-muted-foreground">管理你的个人信息和安全设置</p>
    </div>

    <div v-if="pending" class="grid gap-6 md:grid-cols-2">
      <USkeleton class="h-80 rounded-2xl" />
      <USkeleton class="h-80 rounded-2xl" />
    </div>

    <div v-else class="grid gap-6 md:grid-cols-2">
      <section class="rounded-2xl border border-border bg-card p-6">
        <div class="mb-5 flex items-start gap-4">
          <span class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted/50">
            <img
              v-if="previewImage"
              :src="previewImage"
              alt=""
              class="h-full w-full object-cover"
            />
            <span v-else class="text-xl font-semibold text-primary">{{ initial }}</span>
          </span>
          <div>
            <h2 class="font-semibold text-foreground">基本信息</h2>
            <p class="text-sm text-muted-foreground">
              <template v-if="profile">
                共 {{ profile._count?.links ?? 0 }} 个链接 · 注册于 {{ formatDate(profile.createdAt) }}
              </template>
            </p>
          </div>
        </div>

        <form class="space-y-4" @submit.prevent="handleSaveProfile">
          <UFormField label="显示名称">
            <UInput v-model="profileForm.name" placeholder="你的昵称" class="w-full" />
          </UFormField>
          <UFormField label="邮箱">
            <UInput v-model="profileForm.email" type="email" placeholder="name@example.com" class="w-full" />
          </UFormField>
          <UFormField label="头像地址">
            <UInput v-model="profileForm.image" placeholder="https://… 图片地址（可选）" class="w-full" />
          </UFormField>
          <div class="flex justify-end pt-1">
            <UButton type="submit" icon="i-lucide-save" :loading="savingProfile">保存修改</UButton>
          </div>
        </form>
      </section>

      <section class="rounded-2xl border border-border bg-card p-6">
        <div class="mb-5 flex items-start gap-4">
          <span class="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning">
            <UIcon name="i-lucide-key-round" class="h-7 w-7" />
          </span>
          <div>
            <h2 class="font-semibold text-foreground">修改密码</h2>
            <p class="text-sm text-muted-foreground">修改后需要重新登录</p>
          </div>
        </div>

        <form class="space-y-4" @submit.prevent="handleChangePassword">
          <UFormField label="当前密码" required>
            <UInput v-model="passwordForm.currentPassword" type="password" placeholder="输入当前密码" class="w-full" />
          </UFormField>
          <UFormField label="新密码" required>
            <UInput v-model="passwordForm.newPassword" type="password" placeholder="至少 6 位" class="w-full" />
          </UFormField>
          <UFormField label="确认新密码" required>
            <UInput v-model="passwordForm.confirmPassword" type="password" placeholder="再次输入新密码" class="w-full" />
          </UFormField>
          <div class="flex justify-end pt-1">
            <UButton type="submit" icon="i-lucide-shield-check" :loading="changingPassword">修改密码</UButton>
          </div>
        </form>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: "auth", layout: "dashboard" });

interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  username: string | null;
  image: string | null;
  createdAt: string;
  _count?: { links: number };
}

const requestFetch = useRequestFetch();
const toast = useToast();
const { notify } = useDataSync();
const { fetch: refreshUserSession, clear } = useUserSession();

const queryCache = useQueryCache();

const { data: profile, status } = useQuery({
  key: qk.account(),
  query: () => withFallback(requestFetch<Profile>("/api/account"), null as Profile | null),
});
const pending = computed(() => status.value === "pending");

const profileForm = reactive({ name: "", email: "", image: "" });
const passwordForm = reactive({ currentPassword: "", newPassword: "", confirmPassword: "" });

watch(
  profile,
  (value) => {
    if (!value) return;
    profileForm.name = value.name ?? "";
    profileForm.email = value.email ?? "";
    profileForm.image = value.image ?? "";
  },
  { immediate: true },
);

const initial = computed(() =>
  (profile.value?.name || profile.value?.email || "U").charAt(0).toUpperCase(),
);

const previewImage = computed(() => {
  const url = profileForm.image.trim();
  if (!url) return "";
  return /^https?:\/\//.test(url) ? proxyImageUrl(url, 128) : url;
});

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}

function errorMessage(error: unknown, fallback: string): string {
  return (error as { data?: { error?: string } })?.data?.error || fallback;
}

const savingProfile = ref(false);

async function handleSaveProfile() {
  const body: Record<string, string> = {};
  if (profileForm.name !== (profile.value?.name ?? "")) body.name = profileForm.name;
  if (profileForm.email !== (profile.value?.email ?? "")) body.email = profileForm.email;
  if (profileForm.image !== (profile.value?.image ?? "")) body.image = profileForm.image;

  if (Object.keys(body).length === 0) {
    toast.add({ title: "没有修改任何信息", color: "warning" });
    return;
  }

  savingProfile.value = true;
  try {
    await $fetch<Profile>("/api/account", { method: "PUT", body });
    await refreshUserSession();
    await queryCache.invalidateQueries({ key: qk.session() });
    await queryCache.invalidateQueries({ key: qk.account() });
    notify("User");
    toast.add({ title: "个人信息已更新", icon: "i-lucide-check" });
  } catch (error) {
    toast.add({ title: errorMessage(error, "更新失败"), color: "error" });
  } finally {
    savingProfile.value = false;
  }
}

const changingPassword = ref(false);

async function handleChangePassword() {
  if (!passwordForm.currentPassword) {
    toast.add({ title: "请输入当前密码", color: "error" });
    return;
  }
  if (passwordForm.newPassword.length < 6) {
    toast.add({ title: "新密码至少 6 位", color: "error" });
    return;
  }
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    toast.add({ title: "两次输入的新密码不一致", color: "error" });
    return;
  }

  changingPassword.value = true;
  try {
    await $fetch("/api/account", {
      method: "PUT",
      body: {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      },
    });
    toast.add({ title: "密码已修改，请重新登录", icon: "i-lucide-check" });
    passwordForm.currentPassword = "";
    passwordForm.newPassword = "";
    passwordForm.confirmPassword = "";
    setTimeout(async () => {
      try {
        await $fetch("/api/auth/logout", { method: "POST" });
      } catch {
        // 会话已失效也继续
      }
      clear();
      await navigateTo("/login");
    }, 1200);
  } catch (error) {
    toast.add({ title: errorMessage(error, "修改密码失败"), color: "error" });
  } finally {
    changingPassword.value = false;
  }
}
</script>
