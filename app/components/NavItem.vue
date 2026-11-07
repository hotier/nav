<template>
  <NuxtLink
    v-if="to"
    :to="to"
    class="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors"
    :class="active
      ? 'bg-primary/10 text-primary'
      : 'text-muted-foreground hover:bg-primary/8 hover:text-foreground'"
  >
    <UIcon
      :name="icon"
      class="h-[18px] w-[18px] shrink-0"
      :class="active ? 'text-primary' : 'group-hover:text-primary'"
    />
    <span class="flex-1 truncate">{{ label }}</span>
    <UIcon v-if="active" name="i-lucide-chevron-right" class="h-3.5 w-3.5" />
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
