<template>
  <tr
    class="border-b border-border/60 transition-colors hover:bg-muted/40"
    :class="selected ? 'bg-primary/5 hover:bg-primary/10' : ''"
  >
    <td class="w-px whitespace-nowrap px-3 py-3">
      <UCheckbox :model-value="selected" @update:model-value="emit('toggle')" />
    </td>
    <td class="w-px whitespace-nowrap px-1 py-3">
      <span
        v-if="draggable"
        class="drag-handle inline-flex cursor-grab items-center text-muted-foreground active:cursor-grabbing"
        title="拖拽排序"
      >
        <UIcon name="i-lucide-grip-vertical" class="h-4 w-4" />
      </span>
    </td>
    <td class="w-full min-w-0 px-3 py-3">
      <div class="flex min-w-0 items-center gap-3">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/60">
          <img
            v-if="link.favicon"
            :src="faviconSrc"
            alt=""
            class="h-5 w-5 object-contain"
            loading="lazy"
          >
          <UIcon v-else name="i-lucide-bookmark" class="h-4 w-4 text-muted-foreground" />
        </span>
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <a
              :href="link.url"
              target="_blank"
              rel="noopener noreferrer"
              class="truncate text-sm font-medium text-foreground hover:text-primary"
            >
              {{ link.title }}
            </a>
            <UIcon v-if="link.isPinned" name="i-lucide-pin" class="h-3.5 w-3.5 shrink-0 rotate-45 text-primary" />
          </div>
          <p class="truncate text-xs text-muted-foreground">{{ link.url }}</p>
        </div>
      </div>
    </td>
    <td class="hidden w-px whitespace-nowrap px-3 py-3 sm:table-cell">
      <span class="inline-flex max-w-[10rem] items-center gap-1.5 text-xs text-muted-foreground">
        <DynamicIcon :name="link.category?.icon || 'Folder'" class-name="h-3.5 w-3.5 shrink-0" />
        <span class="truncate">{{ link.category?.name || "未分类" }}</span>
      </span>
    </td>
    <td v-if="isAdmin" class="hidden w-px whitespace-nowrap px-3 py-3 lg:table-cell">
      <span class="block max-w-[8rem] truncate text-xs text-muted-foreground">
        {{ link.userId === currentUserId ? "我" : link.user?.name || link.user?.username || "—" }}
      </span>
    </td>
    <td class="w-px whitespace-nowrap px-3 py-3">
      <UBadge v-if="link.isHidden" color="error" variant="subtle" size="sm">已隐藏</UBadge>
      <UBadge v-else-if="link.isPrivate" color="warning" variant="subtle" size="sm">私有</UBadge>
      <UBadge v-else color="success" variant="subtle" size="sm">公开</UBadge>
    </td>
    <td class="hidden w-px whitespace-nowrap px-3 py-3 text-xs tabular-nums text-muted-foreground md:table-cell">
      {{ formatDate(link.createdAt) }}
    </td>
    <td class="w-px whitespace-nowrap px-3 py-3 text-right">
      <div class="flex items-center justify-end gap-0.5">
        <UTooltip text="编辑">
          <UButton
            variant="ghost"
            color="neutral"
            size="xs"
            square
            icon="i-lucide-pencil"
            aria-label="编辑"
            @click="emit('edit')"
          />
        </UTooltip>
        <UTooltip v-if="canDelete" text="删除">
          <UButton
            variant="ghost"
            color="error"
            size="xs"
            square
            icon="i-lucide-trash-2"
            aria-label="删除"
            @click="emit('delete')"
          />
        </UTooltip>
      </div>
    </td>
  </tr>
</template>

<script setup lang="ts">
import type { Link as LinkType } from "~~/shared/types";

const props = defineProps<{
  link: LinkType & { user?: { id: string; name: string | null; username: string | null; image: string | null } };
  selected: boolean;
  draggable: boolean;
  isAdmin: boolean;
  currentUserId: string;
}>();

const emit = defineEmits<{
  toggle: [];
  edit: [];
  delete: [];
}>();

const faviconSrc = computed(() =>
  !props.link.favicon
    ? ""
    : props.link.favicon.startsWith("/")
      ? props.link.favicon
      : proxyImageUrl(props.link.favicon, 64),
);

const canDelete = computed(
  () => props.isAdmin || props.link.userId === props.currentUserId,
);

function formatDate(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}
</script>
