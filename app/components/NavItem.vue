<template>
  <NuxtLink
    v-if="to"
    :to="to"
    class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
    :class="active
      ? 'bg-gradient-to-r from-primary to-sky-500 text-primary-foreground shadow-md shadow-primary/20'
      : 'text-muted-foreground hover:bg-muted'"
  >
    <UIcon :name="icon" class="h-4 w-4" />
    <span class="flex-1 truncate">{{ label }}</span>
  </NuxtLink>
</template>

<script setup lang="ts">
defineProps<{
  to: string;
  label: string;
  icon: string;
  active?: boolean;
}>();
</script>
