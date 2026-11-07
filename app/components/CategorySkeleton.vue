<template>
  <div class="space-y-6">
    <!-- 标题骨架 -->
    <div class="mb-4 flex items-center gap-3">
      <USkeleton class="h-7 w-7 rounded-lg" />
      <USkeleton class="h-6 w-28" />
      <USkeleton class="h-4 w-8" />
    </div>
    <!-- 卡片骨架：与 LinksGrid 断点一致（1/2/3/4/5 列），卡片高度贴近真实卡片 -->
    <div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      <div v-for="i in count" :key="i" class="rounded-2xl border border-border bg-card p-3 sm:p-4">
        <div class="flex items-start gap-2.5 sm:gap-3">
          <USkeleton class="h-9 w-9 shrink-0 rounded-xl sm:h-10 sm:w-10" />
          <div class="min-w-0 flex-1 space-y-2">
            <USkeleton class="h-4 w-3/4" />
            <USkeleton class="h-3 w-full" />
            <USkeleton class="h-3 w-5/6" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ cardCount?: number }>();
const count = ref(props.cardCount ?? 8);

function calcCardCount(): number {
  const w = window.innerWidth;
  // 与 LinksGrid 真实断点保持一致：2 列起步，lg 3 列，xl 4 列，2xl 5 列
  const cols = w < 1024 ? 2 : w < 1280 ? 3 : w < 1536 ? 4 : 5;
  const rows = Math.min(5, Math.max(1, Math.floor((window.innerHeight - 160) / 120)));
  return cols * rows;
}

onMounted(() => {
  if (props.cardCount) return;
  const update = () => (count.value = calcCardCount());
  update();
  window.addEventListener("resize", update);
  onBeforeUnmount(() => window.removeEventListener("resize", update));
});
</script>
