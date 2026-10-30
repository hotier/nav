<template>
  <form class="space-y-4" @submit.prevent="handleSubmit">
    <div>
      <label for="link-title" class="text-sm font-medium text-foreground">标题 <span class="text-danger">*</span></label>
      <input id="link-title" v-model="form.title" class="field mt-1" placeholder="可自动识别" />
    </div>

    <div>
      <label for="link-url" class="text-sm font-medium text-foreground">URL <span class="text-danger">*</span></label>
      <div class="flex gap-2 mt-1">
        <input
          id="link-url"
          v-model="form.url"
          type="url"
          class="field flex-1"
          placeholder="https://example.com"
          @blur="form.url = cleanUrl(form.url)"
        />
        <button type="button" class="btn-outline shrink-0 gap-1.5" :disabled="isRecognizing || !form.url" @click="handleRecognize">
          <UIcon name="i-lucide-loader-circle" v-if="isRecognizing" class="h-4 w-4 animate-spin" />
          <UIcon name="i-lucide-wand-sparkles" v-else class="h-4 w-4" />
          {{ isRecognizing ? "识别中..." : "识别" }}
        </button>
      </div>
    </div>

    <div>
      <label for="link-favicon" class="text-sm font-medium text-foreground">图标URL</label>
      <input id="link-favicon" v-model="form.favicon" class="field mt-1" placeholder="自动识别或手动输入" />
    </div>

    <div>
      <label for="link-alturl" class="text-sm font-medium text-foreground">备用链接</label>
      <input id="link-alturl" v-model="form.altUrl" type="url" class="field mt-1" placeholder="内网访问地址（可选）" />
    </div>

    <div>
      <label for="link-desc" class="text-sm font-medium text-foreground">描述</label>
      <textarea id="link-desc" v-model="form.description" class="field mt-1 resize-none" rows="3" placeholder="链接描述（可选）" />
    </div>

    <div>
      <label class="text-sm font-medium text-foreground">分类 <span class="text-danger">*</span></label>
      <USelect
        v-model="categoryIdModel"
        :items="categoryItems"
        placeholder="选择分类"
        class="mt-1 w-full"
      />
    </div>

    <div class="flex items-center gap-6 text-sm">
      <label class="inline-flex items-center gap-2 cursor-pointer" :class="form.isPrivate ? 'text-warning' : 'text-success'">
        <input v-model="form.isPrivate" type="checkbox" class="sr-only" />
        <span class="switch" :class="{ on: !form.isPrivate }"><span class="knob" /></span>
        <UIcon name="i-lucide-lock" v-if="form.isPrivate" class="h-3.5 w-3.5" />
        <UIcon name="i-lucide-globe" v-else class="h-3.5 w-3.5" />
        {{ form.isPrivate ? "私有" : "公开" }}
      </label>

      <label v-if="showPinned" class="inline-flex items-center gap-2 cursor-pointer" :class="form.isPinned ? 'text-primary' : 'text-muted-foreground'">
        <input v-model="form.isPinned" type="checkbox" class="sr-only" />
        <span class="switch" :class="{ on: form.isPinned }"><span class="knob" /></span>
        <UIcon name="i-lucide-pin" class="h-3.5 w-3.5" />
        {{ form.isPinned ? "置顶" : "未置顶" }}
      </label>
    </div>

    <div class="flex justify-end gap-2 pt-2">
      <button type="button" class="btn-outline" @click="emit('cancel')">取消</button>
      <button type="submit" class="btn-primary" :disabled="isSubmitting || isRecognizing">
        {{ isRecognizing ? "识别中..." : isSubmitting ? "保存中..." : submitLabel }}
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import type { Category, LinkFormData } from "~~/shared/types";

const toast = useAppToast();

const props = withDefaults(
  defineProps<{
    initialData?: Partial<LinkFormData>;
    categories: Array<Pick<Category, "id" | "name">>;
    isSubmitting?: boolean;
    submitLabel?: string;
    isEdit?: boolean;
    showPinned?: boolean;
  }>(),
  { initialData: () => ({}), isSubmitting: false, submitLabel: "保存", isEdit: false, showPinned: true },
);

const emit = defineEmits<{
  submit: [data: LinkFormData];
  cancel: [];
}>();

const isRecognizing = ref(false);

const categoryItems = computed(() => props.categories.map((c) => ({ label: c.name, value: c.id })));
const categoryIdModel = computed({
  get: () => form.categoryId || undefined,
  set: (value?: string) => (form.categoryId = value || ""),
});

const form = reactive<LinkFormData>({
  title: props.initialData.title || "",
  url: props.initialData.url || "",
  altUrl: props.initialData.altUrl || "",
  description: props.initialData.description || "",
  favicon: props.initialData.favicon || "",
  categoryId: props.initialData.categoryId || "",
  isPrivate: props.initialData.isPrivate || false,
  isPinned: props.initialData.isPinned || false,
});

function snapshot(): LinkFormData {
  return { ...form, url: cleanUrl(form.url) };
}

async function handleSubmit() {
  const data = snapshot();
  form.url = data.url;

  if (!data.url || !data.categoryId) {
    toast.error("请填写必填项");
    return;
  }

  // 仅新建时，且必填项（标题/URL/分类）存在空缺才自动识别（5 秒超时）；编辑直接提交
  if (!props.isEdit && (!data.title || !data.url)) {
    isRecognizing.value = true;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch("/api/links/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: data.url }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const meta = await res.json();
        emit("submit", {
          ...data,
          title: data.title || meta.title || "",
          description: data.description || meta.description || "",
          favicon: data.favicon || meta.favicon || "",
        });
      } else {
        emit("submit", data);
      }
    } catch {
      // 超时或网络错误 → 直接提交
      emit("submit", data);
    } finally {
      isRecognizing.value = false;
    }
  } else {
    emit("submit", data);
  }
}

async function handleRecognize() {
  form.url = cleanUrl(form.url);
  if (!form.url) {
    toast.error("请先输入URL");
    return;
  }

  isRecognizing.value = true;
  try {
    const controller = new AbortController();
    // 识别涉及外部抓取（服务端硬超时 12s），给足 25s 避免误报超时
    const timer = setTimeout(() => controller.abort(), 25000);
    const res = await fetch("/api/links/recognize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: form.url }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const meta = await res.json();
      form.title = form.title || meta.title || "";
      form.description = form.description || meta.description || "";
      form.favicon = form.favicon || meta.favicon || "";
      toast.success("识别成功");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "识别失败");
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") toast.error("识别超时");
    else toast.error("识别失败");
  } finally {
    isRecognizing.value = false;
  }
}
</script>

<style scoped>
.field {
  width: 100%;
  border-radius: 0.75rem;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  color: var(--color-foreground);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.field:focus {
  border-color: var(--color-ring);
  box-shadow: 0 0 0 1px var(--color-ring);
}
.btn-primary {
  border-radius: 0.75rem;
  background: var(--color-primary);
  color: var(--color-primary-foreground);
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  transition: opacity 0.15s ease;
}
.btn-primary:hover {
  opacity: 0.9;
}
.btn-primary:disabled {
  opacity: 0.6;
}
.btn-outline {
  display: inline-flex;
  align-items: center;
  border-radius: 0.75rem;
  border: 1px solid var(--color-border);
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  color: var(--color-muted-foreground);
  transition: background-color 0.15s ease;
}
.btn-outline:hover {
  background: var(--color-muted);
}
.btn-outline:disabled {
  opacity: 0.5;
}
.switch {
  position: relative;
  display: inline-block;
  width: 2rem;
  height: 1.125rem;
  border-radius: 9999px;
  background: var(--color-muted);
  transition: background-color 0.15s ease;
}
.switch.on {
  background: var(--color-primary);
}
.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 9999px;
  background: white;
  transition: transform 0.15s ease;
}
.switch.on .knob {
  transform: translateX(0.875rem);
}
</style>
