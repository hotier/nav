<template>
  <footer class="mt-4 pt-4 pb-4 text-center text-xs text-muted-foreground border-t border-border">
    <span class="font-medium font-display">OneNav</span>
    v{{ version }} · Built with Nuxt &amp; Drizzle · © {{ year }}
  </footer>
</template>

<script setup lang="ts">
const version = "0.2.0";
const year = new Date().getFullYear();
</script>
