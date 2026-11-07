<template>
  <UModal v-model:open="openModel" :title="title">
    <template #body>
      <div class="space-y-3 text-sm">
        <div class="text-muted-foreground">
          <slot>
            <p>确定要执行该操作吗？</p>
          </slot>
        </div>

        <!-- 影响范围：逐条列出会被一并影响的对象，避免用户对级联删除无感知 -->
        <ul v-if="impact.length" class="space-y-1 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
          <li v-for="(item, i) in impact" :key="i" class="flex items-start gap-2 text-xs text-muted-foreground">
            <UIcon name="i-lucide-dot" class="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{{ item }}</span>
          </li>
        </ul>

        <!-- 不可撤销警示：统一用 error 语义色，全站同一措辞位置 -->
        <p v-if="irreversible" class="flex items-center gap-1.5 text-xs font-medium text-error">
          <UIcon name="i-lucide-triangle-alert" class="h-3.5 w-3.5 shrink-0" />
          此操作不可撤销
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="openModel = false">取消</UButton>
        <UButton :color="danger ? 'error' : 'primary'" :loading="loading" @click="emit('confirm')">
          {{ loading ? "处理中…" : confirmLabel }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    confirmLabel?: string;
    loading?: boolean;
    /** 影响范围逐条描述（如「将一并删除 3 个子分类」） */
    impact?: string[];
    /** 是否显示「此操作不可撤销」警示 */
    irreversible?: boolean;
    /** 危险操作：确认按钮用 error 色 */
    danger?: boolean;
  }>(),
  {
    confirmLabel: "确认",
    loading: false,
    impact: () => [],
    irreversible: false,
    danger: true,
  },
);
const emit = defineEmits<{ "update:open": [value: boolean]; confirm: [] }>();

const openModel = computed({
  get: () => props.open,
  set: (value: boolean) => emit("update:open", value),
});
</script>
