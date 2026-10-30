<template>
  <button
    type="button"
    :title="label"
    class="inline-flex items-center justify-center h-9 w-9 rounded-xl text-muted-foreground bg-muted/60 hover:text-foreground hover:bg-primary/10 transition-colors"
    @click="cycle"
  >
    <UIcon name="i-lucide-monitor" v-if="!mounted || theme === 'system'" class="h-[18px] w-[18px]" />
    <UIcon name="i-lucide-moon" v-else-if="theme === 'dark'" class="h-[18px] w-[18px]" />
    <UIcon name="i-lucide-sun" v-else class="h-[18px] w-[18px]" />
    <span class="sr-only">切换主题</span>
  </button>
</template>

<script setup lang="ts">

const { theme, initTheme, cycle } = useTheme();
const mounted = ref(false);

onMounted(() => {
  mounted.value = true;
  initTheme();
});

const label = computed(() => {
  if (!mounted.value) return "切换主题";
  if (theme.value === "dark") return "切换浅色";
  if (theme.value === "light") return "跟随系统";
  return "切换深色";
});
</script>
