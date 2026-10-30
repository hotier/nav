<template>
  <UIcon :name="iconName" :class="className" />
</template>

<script setup lang="ts">
/**
 * 动态渲染分类图标（存库为 lucide PascalCase 名，如 Gamepad2）。
 * @nuxt/icon serverBundle 提供 lucide 全集，任意合法图标名都能 SSR/客户端渲染。
 */
const props = defineProps<{ name: string; className?: string }>();

const iconName = computed(() => `i-lucide-${kebab(props.name) || "folder"}`);

function kebab(name: string): string {
  const raw = (name || "").trim();
  if (!raw) return "folder";
  return raw
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/\s+/g, "-")
    .toLowerCase();
}
</script>
