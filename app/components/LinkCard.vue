<template>
  <div
    :class="compact
      ? 'group bg-card rounded-xl border border-border px-3 py-2 hover:border-primary/40 hover:bg-muted/30 transition-colors'
      : 'h-full group bg-card rounded-2xl border border-border p-3 sm:p-4 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 transition-all duration-200'"
    @click="handleCardClick"
    @contextmenu.prevent="openContextMenu"
  >
    <template v-if="compact">
      <div class="flex items-center gap-2.5">
        <div
          v-if="draggable"
          class="drag-handle flex-shrink-0 cursor-grab active:cursor-grabbing p-0.5 -ml-0.5 hover:bg-muted rounded transition-colors"
          title="拖拽排序"
          @click.stop
        >
          <UIcon name="i-lucide-grip-vertical" class="h-3.5 w-3.5 text-muted-foreground" />
        </div>

        <img
          v-if="link.favicon && !faviconBroken"
          :src="link.favicon.startsWith('https://faviconsnap.com/') ? link.favicon : proxyImageUrl(link.favicon)"
          alt=""
          class="h-6 w-6 flex-shrink-0 rounded-md object-cover border border-border/60 bg-muted/40"
          @error="faviconBroken = true"
        />
        <div
          v-if="!link.favicon || faviconBroken"
          class="favicon-fallback h-6 w-6 flex-shrink-0 rounded-md flex items-center justify-center text-[10px] font-semibold"
          :style="{ '--h': avatarHue }"
        >
          {{ initial }}
        </div>

        <span class="font-medium text-sm text-foreground truncate select-text cursor-text" :title="link.title">
          <template v-for="(part, i) in highlightParts(link.title, searchQuery)" :key="i">
            <mark v-if="part.match" class="bg-yellow-200 dark:bg-yellow-500/30 rounded px-0.5">{{ part.text }}</mark>
            <template v-else>{{ part.text }}</template>
          </template>
        </span>

        <span v-if="link.isPinned" class="inline-flex items-center gap-0.5 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded flex-shrink-0">
          <UIcon name="i-lucide-pin" class="h-3 w-3" />置顶
        </span>
        <span v-if="link.isPrivate" class="inline-flex items-center gap-0.5 text-xs bg-warning-muted text-warning-muted-foreground px-1.5 py-0.5 rounded flex-shrink-0">
          <UIcon name="i-lucide-lock" class="h-3 w-3" />私有
        </span>

        <span class="ml-auto hidden md:block max-w-[45%] flex-shrink-0 truncate text-xs text-muted-foreground select-text" :title="link.url">
          {{ link.url }}
        </span>

        <button
          type="button"
          class="flex-shrink-0 p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
          title="复制链接"
          @click.stop="copyUrl"
        >
          <UIcon name="i-lucide-copy" class="h-3.5 w-3.5" />
        </button>
      </div>
    </template>

    <div v-else class="flex items-start gap-2.5 sm:gap-3">
      <div
        v-if="draggable"
        class="drag-handle flex-shrink-0 cursor-grab active:cursor-grabbing p-1 -ml-1 hover:bg-muted rounded-lg transition-colors"
        title="拖拽排序"
        @click.stop
      >
        <UIcon name="i-lucide-grip-vertical" class="h-4 w-4 text-muted-foreground" />
      </div>

      <div class="flex-shrink-0">
        <img
          v-if="link.favicon && !faviconBroken"
          :src="link.favicon.startsWith('https://faviconsnap.com/') ? link.favicon : proxyImageUrl(link.favicon)"
          alt=""
          class="h-9 w-9 sm:h-10 sm:w-10 rounded-xl object-cover border border-border/60 bg-muted/40"
          @error="faviconBroken = true"
        />
        <div
          v-if="!link.favicon || faviconBroken"
          class="favicon-fallback h-9 w-9 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center text-sm font-semibold"
          :style="{ '--h': avatarHue }"
        >
          {{ initial }}
        </div>
      </div>

      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class="font-semibold text-sm sm:text-base text-foreground truncate select-text cursor-text" :title="link.title">
            <template v-for="(part, i) in highlightParts(link.title, searchQuery)" :key="i">
              <mark v-if="part.match" class="bg-yellow-200 dark:bg-yellow-500/30 rounded px-0.5">{{ part.text }}</mark>
              <template v-else>{{ part.text }}</template>
            </template>
          </span>
          <span v-if="link.isPinned" class="inline-flex items-center gap-0.5 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded flex-shrink-0">
            <UIcon name="i-lucide-pin" class="h-3 w-3" />置顶
          </span>
          <span v-if="link.isPrivate" class="inline-flex items-center gap-0.5 text-xs bg-warning-muted text-warning-muted-foreground px-1.5 py-0.5 rounded flex-shrink-0">
            <UIcon name="i-lucide-lock" class="h-3 w-3" />私有
          </span>
        </div>
        <p class="text-[11px] sm:text-xs text-muted-foreground truncate mb-1 select-text" :title="link.url">
          <template v-for="(part, i) in highlightParts(link.url, searchQuery)" :key="i">
            <mark v-if="part.match" class="bg-yellow-200 dark:bg-yellow-500/30 rounded px-0.5">{{ part.text }}</mark>
            <template v-else>{{ part.text }}</template>
          </template>
        </p>
        <p class="text-[11px] sm:text-xs text-muted-foreground line-clamp-2 min-h-[2rem] select-text" :title="link.description || undefined">
          <template v-for="(part, i) in highlightParts(link.description || '', searchQuery)" :key="i">
            <mark v-if="part.match" class="bg-yellow-200 dark:bg-yellow-500/30 rounded px-0.5">{{ part.text }}</mark>
            <template v-else>{{ part.text }}</template>
          </template>
        </p>
      </div>

      <div class="flex-shrink-0 flex items-center gap-1 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          class="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
          title="复制链接"
          @click.stop="copyUrl"
        >
          <UIcon name="i-lucide-copy" class="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>

  <!-- 右键菜单 -->
  <Teleport to="body">
    <div v-if="menu.open" class="fixed inset-0 z-[90]" @mousedown="menu.open = false" @contextmenu.prevent="menu.open = false">
      <div
        class="absolute w-52 rounded-xl border border-border bg-popover p-1 shadow-xl text-sm"
        :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
        @mousedown.stop
      >
        <button type="button" class="menu-item" @click="run(openLink)">
          <UIcon name="i-lucide-external-link" class="h-4 w-4" />打开链接
        </button>
        <button v-if="link.altUrl" type="button" class="menu-item" @click="run(openAltLink)">
          <UIcon name="i-lucide-external-link" class="h-4 w-4" />打开备用链接
        </button>
        <button type="button" class="menu-item" @click="run(copyUrl)">
          <UIcon name="i-lucide-copy" class="h-4 w-4" />复制链接
        </button>
        <button type="button" class="menu-item" @click="run(copyMarkdown)">
          <UIcon name="i-lucide-copy" class="h-4 w-4" />复制为 Markdown
        </button>
        <button type="button" class="menu-item" @click="run(openQr)">
          <UIcon name="i-lucide-qr-code" class="h-4 w-4" />显示二维码
        </button>
        <template v-if="isAdmin">
          <div class="my-1 h-px bg-border" />
          <button type="button" class="menu-item" @click="run(openEdit)">
            <UIcon name="i-lucide-pencil" class="h-4 w-4" />编辑链接
          </button>
          <button type="button" class="menu-item" @click="run(() => emit('update', link.id, { isPinned: !link.isPinned }))">
            <UIcon name="i-lucide-pin" class="h-4 w-4" />{{ link.isPinned ? "取消置顶" : "置顶" }}
          </button>
          <div class="my-1 h-px bg-border" />
          <button type="button" class="menu-item text-danger hover:!text-danger" @click="run(() => emit('delete', link.id))">
            <UIcon name="i-lucide-trash-2" class="h-4 w-4" />删除
          </button>
        </template>
      </div>
    </div>
  </Teleport>

  <!-- 二维码 -->
  <UModal v-model:open="showQr" :title="link.title" class="max-w-xs">
    <template #body>
      <div class="flex justify-center p-4 bg-card rounded-lg">
        <QrcodeVue :value="link.url" :size="180" level="M" />
      </div>
      <p class="text-center text-xs text-muted-foreground break-all px-2 mt-2">{{ link.url }}</p>
    </template>
  </UModal>

  <!-- 编辑 -->
  <UModal v-model:open="editing" title="编辑链接">
    <template #body>
      <LinkForm
        :initial-data="{
          title: link.title,
          url: link.url,
          altUrl: link.altUrl || '',
          description: link.description || '',
          favicon: link.favicon || '',
          categoryId: link.categoryId,
          isPrivate: link.isPrivate,
          isPinned: link.isPinned,
        }"
        :categories="categories.filter((c) => !c.parentId)"
        submit-label="保存"
        is-edit
        @submit="handleEditSubmit"
        @cancel="editing = false"
      />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch } from "vue";
import QrcodeVue from "qrcode.vue";
import type { Link as LinkType, Category, LinkFormData } from "~~/shared/types";

const toast = useAppToast();

const props = withDefaults(
  defineProps<{
    link: LinkType;
    categories: Category[];
    isAdmin?: boolean;
    searchQuery?: string;
    draggable?: boolean;
    compact?: boolean;
  }>(),
  { isAdmin: false, searchQuery: "", draggable: false, compact: false },
);

const emit = defineEmits<{
  update: [id: string, data: Partial<LinkType>];
  delete: [id: string];
}>();

const menu = reactive({ open: false, x: 0, y: 0 });
const showQr = ref(false);
const editing = ref(false);
const faviconBroken = ref(false);

const initial = computed(() => {
  const source = props.link.title || props.link.url;
  return (source.trim().charAt(0) || "?").toUpperCase();
});

// 无图标时用站点名首字母作占位，颜色由名称哈希决定，同类站点颜色稳定
const avatarHue = computed(() => {
  const seed = props.link.title || props.link.url;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
});

// link.favicon 变化（编辑保存/重新识别）时重置失效状态
watch(() => props.link.favicon, () => (faviconBroken.value = false));

function openContextMenu(e: MouseEvent) {
  const x = Math.min(e.clientX, window.innerWidth - 220);
  const y = Math.min(e.clientY, window.innerHeight - 320);
  Object.assign(menu, { open: true, x, y });
}

function run(fn: () => void) {
  menu.open = false;
  fn();
}

function openQr() {
  showQr.value = true;
}

function openEdit() {
  editing.value = true;
}

async function copyUrl() {
  try {
    await navigator.clipboard.writeText(props.link.url);
    toast.success("链接已复制");
  } catch {
    toast.error("复制失败");
  }
}

async function copyMarkdown() {
  try {
    await navigator.clipboard.writeText(`[${props.link.title}](${props.link.url})`);
    toast.success("Markdown 已复制");
  } catch {
    toast.error("复制失败");
  }
}

function openLink() {
  window.open(props.link.url, "_blank", "noopener,noreferrer");
}

function openAltLink() {
  if (props.link.altUrl) window.open(props.link.altUrl, "_blank", "noopener,noreferrer");
}

function handleCardClick() {
  // 选中文本时不打开链接（允许复制标题/描述）
  if (window.getSelection()?.toString()) return;
  openLink();
}

async function handleEditSubmit(data: LinkFormData) {
  // 乐观更新：立即关闭弹窗，请求在父级完成；成功/失败提示由父级统一处理
  editing.value = false;
  emit("update", props.link.id, data);
}
</script>

<style scoped>
.favicon-fallback {
  background: hsl(var(--h) 70% 92%);
  color: hsl(var(--h) 55% 32%);
}
:global(.dark) .favicon-fallback {
  background: hsl(var(--h) 35% 24%);
  color: hsl(var(--h) 70% 80%);
}
.menu-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  border-radius: 0.5rem;
  color: var(--color-muted-foreground);
  text-align: left;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.menu-item:hover {
  background: var(--color-muted);
  color: var(--color-foreground);
}
</style>
