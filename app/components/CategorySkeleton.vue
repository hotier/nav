<template>
  <div class="space-y-6">
    <div class="flex items-center gap-3 mb-4">
      <div class="h-8 w-8 rounded-lg bg-muted animate-pulse" />
      <div class="h-7 w-24 rounded bg-muted animate-pulse" />
      <div class="h-5 w-8 rounded bg-muted animate-pulse" />
    </div>
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      <div v-for="i in count" :key="i" class="rounded-xl border border-border bg-card p-4 space-y-3">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-lg bg-muted animate-pulse" />
          <div class="flex-1 space-y-1.5">
            <div class="h-4 w-24 rounded bg-muted animate-pulse" />
            <div class="h-3 w-32 rounded bg-muted animate-pulse" />
          </div>
        </div>
        <div class="h-3 w-3/4 rounded bg-muted animate-pulse" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ cardCount?: number }>();
const count = ref(props.cardCount ?? 8);

function calcCardCount(): number {
  const w = window.innerWidth;
  // 与 LinksGrid 真实断点保持一致
  const cols = w < 640 ? 1 : w < 1024 ? 2 : w < 1280 ? 3 : w < 1536 ? 4 : 5;
  const rows = Math.min(5, Math.max(1, Math.floor((window.innerHeight - 120) / 130)));
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
