<template>
  <form class="space-y-4" @submit.prevent="handleSubmit">
    <!--
      标题：字数计数放在输入框内部右侧（trailing 插槽）。
      有输入就显示（空时不显示），UInput 会自动补 pe-*，文字不会被计数压住。
    -->
    <UFormField label="标题" required>
      <UInput v-model="title" placeholder="留空将自动识别" maxlength="200" class="w-full">
        <template #trailing>
          <span
            v-if="title.length > 0"
            class="text-xs tabular-nums"
            :class="title.length >= 200 ? 'text-error' : 'text-muted-foreground'"
          >
            {{ title.length }}/200
          </span>
        </template>
      </UInput>
    </UFormField>

    <!-- URL + 识别 -->
    <UFormField label="URL" required>
      <div class="flex gap-2">
        <UInput
          v-model="url"
          type="url"
          placeholder="https://example.com"
          class="flex-1"
          @blur="url = cleanUrl(url)"
        />
        <UButton
          type="button"
          variant="outline"
          color="neutral"
          :disabled="isRecognizing || !url"
          :loading="isRecognizing"
          :icon="isRecognizing ? undefined : 'i-lucide-wand-sparkles'"
          class="shrink-0"
          @click="handleRecognize"
        >
          {{ isRecognizing ? "识别中" : title || description ? "重新识别" : "识别" }}
        </UButton>
      </div>
      <p class="mt-1 text-xs text-muted-foreground">
        识别会抓取页面标题、描述与图标；已填写的字段不会被覆盖
      </p>
    </UFormField>

    <!-- 图标 + 备用链接：桌面端并排，减少弹窗高度 -->
    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="图标 URL">
        <div class="flex items-center gap-2">
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/50"
          >
            <img
              v-if="faviconPreview && !faviconBroken"
              :src="faviconPreview"
              alt=""
              class="h-5 w-5 object-contain"
              @error="faviconBroken = true"
            >
            <UIcon v-else name="i-lucide-image" class="h-4 w-4 text-muted-foreground" />
          </span>
          <UInput
            v-model="favicon"
            placeholder="自动识别或手动填写"
            class="flex-1"
            @update:model-value="faviconBroken = false"
          />
        </div>
      </UFormField>

      <UFormField label="备用链接">
        <UInput v-model="altUrl" type="url" placeholder="内网地址（可选）" class="w-full" />
      </UFormField>
    </div>

    <!--
      描述：字数计数放 textarea 内部右下角。
      textarea 的 trailing 是 absolute 定位（inset-y），这里用 self-end 把计数压到底部。
      有输入就显示（空时不显示）。
    -->
    <UFormField label="描述">
      <UTextarea
        v-model="description"
        :rows="2"
        maxlength="500"
        autoresize
        placeholder="一句话说明这个站点（可选）"
        class="w-full"
      >
        <template #trailing>
          <span
            v-if="description.length > 0"
            class="self-end pb-1 text-xs tabular-nums"
            :class="description.length >= 500 ? 'text-error' : 'text-muted-foreground'"
          >
            {{ description.length }}/500
          </span>
        </template>
      </UTextarea>
    </UFormField>

    <!--
      分类 + 可见性 + 置顶 同一行。
      分类用 flex-1 吃剩余宽度，两个开关固定宽度靠右；
      窄屏（<sm）自动换行成上下两段，避免挤压。
    -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
      <UFormField label="分类" required class="min-w-0 flex-1">
        <USelect v-model="categoryId" :items="categoryItems" placeholder="选择分类" class="w-full" />
      </UFormField>

      <div class="flex shrink-0 items-center gap-2">
        <!--
          可见性：开关语义是「公开」——开启 = 公开，关闭 = 私有。
          数据层存的是 isPrivate，这里用 computed 做一次取反，
          保证「新建时默认公开」在 UI 上表现为「滑块默认开启」。
          「公开」/「私有」同为 2 字，宽度一致，切换时不会撑动容器。
        -->
        <button
          type="button"
          class="flex items-center gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2 text-sm transition-colors hover:bg-muted/40"
          :title="isPrivate ? '当前：私有（仅自己可见）' : '当前：公开（受分类可见性约束）'"
          @click="isPublic = !isPublic"
        >
          <USwitch v-model="isPublic" class="pointer-events-none" tabindex="-1" />
          <UIcon
            :name="isPrivate ? 'i-lucide-lock' : 'i-lucide-globe'"
            class="h-3.5 w-3.5"
            :class="isPrivate ? 'text-warning' : 'text-success'"
          />
          <span class="w-8 shrink-0" :class="isPrivate ? 'text-warning' : 'text-success'">
            {{ isPrivate ? "私有" : "公开" }}
          </span>
        </button>

        <!--
          置顶：「置顶」(2 字) 与「未置顶」(3 字) 字数不同，
          标签固定宽度，避免切换时整行容器宽度跳动。
        -->
        <button
          v-if="showPinned"
          type="button"
          class="flex items-center gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2 text-sm transition-colors hover:bg-muted/40"
          :title="isPinned ? '当前：已置顶（列表最前方）' : '当前：未置顶'"
          @click="isPinned = !isPinned"
        >
          <USwitch v-model="isPinned" class="pointer-events-none" tabindex="-1" />
          <UIcon
            name="i-lucide-pin"
            class="h-3.5 w-3.5"
            :class="isPinned ? 'text-primary' : 'text-muted-foreground'"
          />
          <span class="w-12 shrink-0" :class="isPinned ? 'text-primary' : 'text-muted-foreground'">
            {{ isPinned ? "置顶" : "未置顶" }}
          </span>
        </button>
      </div>
    </div>

    <div class="flex justify-end gap-2 pt-1">
      <UButton type="button" variant="ghost" color="neutral" @click="emit('cancel')">取消</UButton>
      <UButton type="submit" :loading="isSubmitting || isRecognizing" :disabled="isRecognizing">
        {{ isRecognizing ? "识别中…" : isSubmitting ? "保存中…" : submitLabel }}
      </UButton>
    </div>
  </form>
</template>

<script setup lang="ts">
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

/**
 * 每个字段独立 ref。
 * 不用 reactive 对象承载表单：UInput/USwitch 是泛型组件，`v-model="obj.prop"` 在
 * vue-tsc 下会触发误报（Property 'value' does not exist），拆成独立 ref 后类型推断正常。
 */
const title = ref(props.initialData.title ?? "");
const url = ref(props.initialData.url ?? "");
const altUrl = ref(props.initialData.altUrl ?? "");
const description = ref(props.initialData.description ?? "");
const favicon = ref(props.initialData.favicon ?? "");
const categoryId = ref<string | undefined>(props.initialData.categoryId || undefined);
const isPrivate = ref(props.initialData.isPrivate ?? false);
const isPinned = ref(props.initialData.isPinned ?? false);

/**
 * 可见性开关的 UI 语义是「公开」：滑块开启 = 公开，关闭 = 私有。
 * 数据层（LinkFormData / DB）存的是 isPrivate，两者互为取反。
 * 这样新建时 isPrivate 默认 false → 滑块默认开启 → 视觉上「默认公开」。
 */
const isPublic = computed({
  get: () => !isPrivate.value,
  set: (value: boolean) => (isPrivate.value = !value),
});

const isRecognizing = ref(false);
const faviconBroken = ref(false);

const categoryItems = computed(() => props.categories.map((c) => ({ label: c.name, value: c.id })));

/** 图标预览：外部 URL 走服务端代理（与列表页同口径），本地路径直连 */
const faviconPreview = computed(() => {
  const value = favicon.value.trim();
  if (!value) return "";
  if (value.startsWith("/") || value.startsWith("data:")) return value;
  if (value.startsWith("https://faviconsnap.com/")) return value;
  return proxyImageUrl(value, 64);
});

function snapshot(): LinkFormData {
  return {
    title: title.value.trim(),
    url: cleanUrl(url.value),
    altUrl: altUrl.value.trim(),
    description: description.value.trim(),
    favicon: favicon.value.trim(),
    categoryId: categoryId.value ?? "",
    isPrivate: isPrivate.value,
    isPinned: isPinned.value,
  };
}

/** 调识别接口；返回识别结果，失败返回 null（不阻塞保存） */
async function recognize(target: string, timeoutMs: number): Promise<Partial<LinkFormData> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("/api/links/recognize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: target }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as Partial<LinkFormData>;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function handleSubmit() {
  const data = snapshot();
  url.value = data.url;

  if (!data.url) {
    toast.error("请填写 URL");
    return;
  }
  if (!data.categoryId) {
    toast.error("请选择分类");
    return;
  }

  // 仅新建时，且标题为空才自动识别（5 秒超时）；编辑直接提交，不覆盖用户输入
  if (!props.isEdit && !data.title) {
    isRecognizing.value = true;
    try {
      const meta = await recognize(data.url, 5000);
      emit("submit", {
        ...data,
        title: meta?.title || data.url,
        description: data.description || meta?.description || "",
        favicon: data.favicon || meta?.favicon || "",
      });
    } finally {
      isRecognizing.value = false;
    }
  } else {
    emit("submit", data);
  }
}

async function handleRecognize() {
  url.value = cleanUrl(url.value);
  if (!url.value) {
    toast.error("请先填写 URL");
    return;
  }

  isRecognizing.value = true;
  try {
    // 识别涉及外部抓取（服务端硬超时 12s），给足 25s 避免误报超时
    const meta = await recognize(url.value, 25000);
    if (!meta) {
      toast.error("识别失败，请手动填写");
      return;
    }
    // 只补空缺字段，不覆盖用户已输入的内容
    const filled: string[] = [];
    if (!title.value.trim() && meta.title) {
      title.value = meta.title;
      filled.push("标题");
    }
    if (!description.value.trim() && meta.description) {
      description.value = meta.description;
      filled.push("描述");
    }
    if (!favicon.value.trim() && meta.favicon) {
      favicon.value = meta.favicon;
      faviconBroken.value = false;
      filled.push("图标");
    }
    if (filled.length) toast.success(`已识别并填入${filled.join("、")}`);
    else toast.info("识别完成，但所有字段都已填写，未做改动");
  } finally {
    isRecognizing.value = false;
  }
}
</script>
