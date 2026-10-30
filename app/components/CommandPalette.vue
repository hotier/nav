<template>
  <UModal v-model:open="open" :ui="{ content: 'max-w-xl p-0 overflow-hidden' }">
    <template #content>
      <UCommandPalette
        :groups="groups"
        :close="false"
        placeholder="搜索链接或页面…"
      />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem } from "@nuxt/ui";
import type { Category, Link as LinkType, SessionUser } from "~~/shared/types";

const open = useState("command-palette-open", () => false);
const requestFetch = useRequestFetch();
const router = useRouter();

const { data: nav } = useQuery({
  key: qk.nav(),
  query: () =>
    withFallback(
      requestFetch<{ user: SessionUser | null; categories: Category[] }>("/api/nav"),
      { user: null, categories: [] as Category[] },
    ),
});

const { data: linkData } = useQuery({
  key: qk.homeLinks(),
  query: () =>
    withFallback(
      requestFetch<{ data: LinkType[]; total: number }>("/api/links?page=1&pageSize=1000&sort=recent"),
      { data: [] as LinkType[], total: 0 },
    ),
});

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function close() {
  open.value = false;
}

function go(to: string) {
  close();
  router.push(to);
}

const groups = computed<CommandPaletteGroup[]>(() => {
  const user = nav.value?.user ?? null;
  const links = linkData.value?.data ?? [];
  const result: CommandPaletteGroup[] = [];

  if (links.length) {
    result.push({
      id: "links",
      label: "链接",
      items: links.map<CommandPaletteItem>((link) => ({
        label: link.title,
        description: hostOf(link.url),
        icon: "i-lucide-link-2",
        onSelect: () => {
          close();
          window.open(link.url, "_blank", "noopener,noreferrer");
        },
      })),
    });
  }

  const pages: CommandPaletteItem[] = [
    { label: "首页", icon: "i-lucide-house", onSelect: () => go("/") },
  ];

  if (user) {
    pages.push(
      { label: "管理后台", icon: "i-lucide-layout-dashboard", onSelect: () => go("/dashboard") },
      { label: "链接管理", icon: "i-lucide-link-2", onSelect: () => go("/dashboard/links") },
      { label: "分类管理", icon: "i-lucide-folder-open", onSelect: () => go("/dashboard/categories") },
      { label: "导入导出", icon: "i-lucide-file-up", onSelect: () => go("/dashboard/import-export") },
      { label: "设置", icon: "i-lucide-settings-2", onSelect: () => go("/dashboard/settings") },
      { label: "账户管理", icon: "i-lucide-user-round", onSelect: () => go("/dashboard/account") },
    );
  } else {
    pages.push({ label: "登录", icon: "i-lucide-log-in", onSelect: () => go("/login") });
  }

  result.push({ id: "pages", label: "前往", items: pages });
  return result;
});

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    open.value = !open.value;
  }
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>
