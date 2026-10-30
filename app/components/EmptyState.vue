<template>
  <div class="flex flex-col items-center justify-center text-center" :class="compact ? 'py-16' : 'py-24'">
    <div
      class="mb-4 flex items-center justify-center rounded-2xl border border-border/60 bg-muted/60"
      :class="compact ? 'h-12 w-12' : 'h-14 w-14'"
    >
      <UIcon :name="icon" class="text-muted-foreground/70" :class="compact ? 'h-5 w-5' : 'h-6 w-6'" />
    </div>
    <p class="font-semibold text-foreground" :class="compact ? 'text-sm' : 'text-base'">{{ title }}</p>
    <p v-if="description" class="mt-1 text-muted-foreground" :class="compact ? 'text-xs' : 'text-sm'">
      {{ description }}
    </p>
    <div v-if="$slots.default" class="mt-6">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{ icon: string; title: string; description?: string; compact?: boolean }>(),
  { description: "", compact: false },
);
</script>
