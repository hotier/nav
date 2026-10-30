<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-foreground font-display">导入导出</h1>
      <p class="mt-1 text-sm text-muted-foreground">备份你的书签，或从浏览器迁移已有收藏</p>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <section class="rounded-2xl border border-border bg-card p-6">
        <div class="mb-5 flex items-start gap-4">
          <span class="flex h-12 w-12 items-center justify-center rounded-xl bg-success/10 text-success">
            <UIcon name="i-lucide-download" class="h-6 w-6" />
          </span>
          <div>
            <h2 class="font-semibold text-foreground">导出书签</h2>
            <p class="text-sm text-muted-foreground">导出你自己的链接，可用于备份或迁移到其他工具</p>
          </div>
        </div>

        <div class="space-y-4">
          <UFormField label="导出格式">
            <USelect v-model="exportFormat" :items="formatItems" class="w-full" />
          </UFormField>

          <div class="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 p-3">
            <div>
              <p class="text-sm font-medium text-foreground">包含私有链接</p>
              <p class="text-xs text-muted-foreground">关闭时只导出公开链接</p>
            </div>
            <USwitch v-model="includePrivate" />
          </div>

          <div class="flex justify-end pt-1">
            <UButton icon="i-lucide-download" :loading="exporting" @click="handleExport">
              导出{{ exportFormat === "json" ? " JSON" : " HTML" }}
            </UButton>
          </div>
        </div>
      </section>

      <section class="rounded-2xl border border-border bg-card p-6">
        <div class="mb-5 flex items-start gap-4">
          <span class="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UIcon name="i-lucide-upload" class="h-6 w-6" />
          </span>
          <div>
            <h2 class="font-semibold text-foreground">导入书签</h2>
            <p class="text-sm text-muted-foreground">支持浏览器导出的 HTML 书签和 JSON 文件</p>
          </div>
        </div>

        <div class="space-y-4">
          <label
            class="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
            @dragover.prevent
            @drop.prevent="handleDrop"
          >
            <UIcon name="i-lucide-file-up" class="mb-2 h-8 w-8 text-muted-foreground" />
            <span class="text-sm font-medium text-foreground">
              {{ file ? file.name : "点击选择或拖拽文件到此处" }}
            </span>
            <span class="mt-1 text-xs text-muted-foreground">
              {{ file ? formatSize(file.size) : "支持 .html / .htm / .json，最大 8MB" }}
            </span>
            <input type="file" accept=".html,.htm,.json,application/json,text/html" class="sr-only" @change="handleFileChange" />
          </label>

          <UFormField label="导入到分类">
            <USelect v-model="targetCategory" :items="targetItems" class="w-full" />
            <p class="mt-1 text-xs text-muted-foreground">
              不选择时会使用你的第一个分类；没有分类时自动创建「默认分类」
            </p>
          </UFormField>

          <div v-if="importResult" class="rounded-xl border px-3 py-2 text-sm" :class="importResult.error ? 'border-error/30 bg-error/5 text-error' : 'border-success/30 bg-success/5 text-success-muted-foreground'">
            {{ importResult.message }}
          </div>

          <div class="flex justify-end gap-2 pt-1">
            <UButton v-if="file" variant="ghost" color="neutral" @click="resetFile">清除</UButton>
            <UButton icon="i-lucide-upload" :disabled="!file" :loading="importing" @click="handleImport">
              开始导入
            </UButton>
          </div>
        </div>
      </section>
    </div>

    <section class="rounded-2xl border border-border bg-muted/20 p-5 text-sm text-muted-foreground">
      <h3 class="mb-2 font-medium text-foreground">说明</h3>
      <ul class="list-inside list-disc space-y-1 text-xs leading-relaxed">
        <li>导入按 URL 去重：库内已有或文件内重复的链接会被跳过。</li>
        <li>导入后会在后台自动补全缺失的标题、描述和图标。</li>
        <li>JSON 导出包含分类结构与链接元数据，适合完整备份。</li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { Category } from "~~/shared/types";

definePageMeta({ middleware: "auth", layout: "dashboard" });

const requestFetch = useRequestFetch();
const toast = useToast();
const { notify } = useDataSync();

const formatItems = [
  { label: "JSON（完整数据）", value: "json" },
  { label: "HTML（浏览器书签）", value: "html" },
];

const exportFormat = ref("json");
const includePrivate = ref(true);
const exporting = ref(false);

async function handleExport() {
  exporting.value = true;
  try {
    const response = await fetch(
      `/api/import-export/export?format=${exportFormat.value}&includePrivate=${includePrivate.value}`,
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || "导出失败");
    }

    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") ?? "";
    const match = /filename="?([^";]+)"?/i.exec(disposition);
    const fallback = `onenav-bookmarks-${new Date().toISOString().slice(0, 10)}.${exportFormat.value}`;
    const filename = match?.[1] || fallback;

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    toast.add({ title: "导出完成", icon: "i-lucide-check" });
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : "导出失败",
      color: "error",
    });
  } finally {
    exporting.value = false;
  }
}

const { data: categoryData } = useQuery({
  key: qk.manageCategories(),
  query: () =>
    withFallback(
      requestFetch<Category[]>("/api/categories?scope=manage&forSelector=true"),
      [] as Category[],
    ),
});

const targetItems = computed(() => {
  const top = (categoryData.value ?? []).filter((category) => !category.parentId);
  const options = [{ label: "自动选择（默认分类）", value: "auto" }];
  for (const category of top) {
    options.push({ label: category.name, value: category.id });
    for (const child of category.children ?? []) {
      options.push({ label: `${category.name} / ${child.name}`, value: child.id });
    }
  }
  return options;
});

const targetCategory = ref("auto");
const file = ref<File | null>(null);
const importing = ref(false);
const importResult = ref<{ message: string; error?: boolean } | null>(null);

const MAX_SIZE = 8_000_000;

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const selected = target.files?.[0];
  if (selected) setFile(selected);
  target.value = "";
}

function handleDrop(event: DragEvent) {
  const dropped = event.dataTransfer?.files?.[0];
  if (dropped) setFile(dropped);
}

function setFile(selected: File) {
  importResult.value = null;
  if (selected.size > MAX_SIZE) {
    toast.add({ title: "文件超过 8MB 限制", color: "error" });
    return;
  }
  file.value = selected;
}

function resetFile() {
  file.value = null;
  importResult.value = null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function errorMessage(error: unknown, fallback: string): string {
  return (error as { data?: { error?: string } })?.data?.error || fallback;
}

async function handleImport() {
  const selected = file.value;
  if (!selected) return;

  importing.value = true;
  importResult.value = null;
  try {
    const data = await selected.text();
    const isJson =
      selected.name.toLowerCase().endsWith(".json") ||
      /^\s*[[{]/.test(data.slice(0, 64));

    const body: { data: string; format: "html" | "json"; categoryId?: string } = {
      data,
      format: isJson ? "json" : "html",
    };
    if (targetCategory.value !== "auto") body.categoryId = targetCategory.value;

    const result = await $fetch<{ imported: number; skipped: number; message: string }>(
      "/api/import-export/import",
      { method: "POST", body },
    );

    const detail = result.skipped > 0
      ? `${result.message}，跳过 ${result.skipped} 个重复链接`
      : result.message;
    importResult.value = { message: detail };
    toast.add({ title: "导入完成", icon: "i-lucide-check" });

    file.value = null;
    notify("Link");
    notify("Category");
  } catch (error) {
    const message = errorMessage(error, "导入失败");
    importResult.value = { message, error: true };
    toast.add({ title: message, color: "error" });
  } finally {
    importing.value = false;
  }
}
</script>
