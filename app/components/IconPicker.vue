<template>
  <div class="space-y-3">
    <div class="flex items-center gap-2">
      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/50">
        <DynamicIcon :name="modelValue || 'Folder'" class-name="h-5 w-5 text-primary" />
      </span>
      <UInput
        :model-value="modelValue"
        placeholder="lucide 图标名，如 Folder"
        class="flex-1"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </div>
    <div class="grid grid-cols-9 gap-1.5 sm:grid-cols-12">
      <button
        v-for="icon in icons"
        :key="icon"
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors"
        :class="modelValue === icon
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted'"
        :title="icon"
        @click="emit('update:modelValue', icon)"
      >
        <DynamicIcon :name="icon" class-name="h-4 w-4" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const icons = [
  "Folder", "Home", "Star", "Bookmark", "Code", "Briefcase", "Camera", "Gamepad2",
  "Music", "Cloud", "Database", "FileText", "Globe", "Heart", "Book", "Coffee",
  "Plane", "ShoppingBag", "Wrench", "Flame", "Lightbulb", "GraduationCap", "Film", "Rss",
];
</script>
