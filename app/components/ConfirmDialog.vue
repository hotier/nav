<template>
  <UModal v-model:open="openModel" :title="title">
    <template #body>
      <div class="text-sm text-muted-foreground">
        <slot>
          <p>确定要执行该操作吗？</p>
        </slot>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton color="neutral" variant="outline" @click="openModel = false">取消</UButton>
        <UButton color="error" :loading="loading" @click="emit('confirm')">
          {{ loading ? "处理中…" : confirmLabel }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{ open: boolean; title: string; confirmLabel?: string; loading?: boolean }>(),
  { confirmLabel: "确认", loading: false },
);
const emit = defineEmits<{ "update:open": [value: boolean]; confirm: [] }>();

const openModel = computed({
  get: () => props.open,
  set: (value: boolean) => emit("update:open", value),
});
</script>
