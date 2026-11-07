<template>
  <div>
    <div class="mb-6 flex items-center gap-2.5">
      <UIcon name="i-lucide-house" class="h-6 w-6 text-foreground" />
      <h2 class="flex items-baseline gap-2 text-2xl font-bold text-foreground font-display">
        全部书签
        <span v-if="!pending" class="text-sm font-normal text-muted-foreground">
          {{ shownCount }}
        </span>
        <!-- 即时过滤提示：与顶栏搜索框的模式说明呼应，避免误以为已做全量搜索 -->
        <UBadge v-if="liveQuery.trim()" variant="subtle" color="primary" size="sm">
          即时过滤中
        </UBadge>
      </h2>

      <div class="ml-auto flex items-center gap-2">
        <UButton
          variant="soft"
          color="neutral"
          :icon="view === 'card' ? 'i-lucide-list' : 'i-lucide-layout-grid'"
          square
          :aria-label="view === 'card' ? '切换为紧凑视图' : '切换为卡片视图'"
          @click="toggleView"
        />
      </div>
    </div>

    <CategorySkeleton v-if="pending" />

    <EmptyState
      v-else-if="links.length === 0"
      icon="i-lucide-bookmark"
      :title="user ? '还没有书签' : '还没有书签'"
      :description="user ? '点击右下角按钮开始添加' : '登录后可以添加和管理书签'"
    >
      <UButton v-if="user" icon="i-lucide-plus" @click="openCreate">新增链接</UButton>
      <UButton v-else to="/login" icon="i-lucide-log-in">前往登录</UButton>
    </EmptyState>

    <EmptyState
      v-else-if="filtered.length === 0"
      icon="i-lucide-search-x"
      title="当前列表没有匹配的链接"
      description="按 Enter 走服务端全量搜索"
    />

    <LinksGrid
      v-else
      :links="filtered"
      :categories="categories"
      :is-admin="isAdmin"
      :search-query="liveQuery"
      :view="view"
    />

    <!--
      新增链接浮动按钮（FAB）：固定屏幕右下角。
      - 收起：min-w-14 + h-14 → 正圆（56×56）
      - 展开：宽度由内容撑开（gap / padding / 文字 max-width 三个可动画属性同时过渡），
        所以按钮宽度是"跟着内容平滑长出来"的，而不是 w-auto 那种瞬间跳变
      - 缓动曲线用 material emphasized-decelerate，收尾更稳、没有弹跳感
      - 只在有可写分类时出现；未登录 / 无可写分类不渲染
    -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-2 scale-90 opacity-0"
      enter-to-class="translate-y-0 scale-100 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-y-0 scale-100 opacity-100"
      leave-to-class="translate-y-2 scale-90 opacity-0"
    >
      <button
        v-if="canAddLink"
        type="button"
        class="group fixed bottom-6 right-6 z-40 flex h-14 min-w-14 items-center justify-center gap-0 overflow-hidden rounded-full bg-gradient-to-br from-primary via-sky-500 to-cyan-500 px-0 text-white shadow-lg shadow-primary/30 transition-[gap,padding,box-shadow,filter,transform] duration-300 ease-[cubic-bezier(0.05,0.7,0.1,1)] hover:gap-2 hover:px-5 hover:shadow-xl hover:shadow-primary/40 hover:brightness-105 focus-visible:gap-2 focus-visible:px-5 focus-visible:outline-3 focus-visible:outline-primary/40 active:scale-95 motion-reduce:transition-none sm:right-8 sm:bottom-8"
        aria-label="新增链接"
        title="新增链接"
        @click="openCreate"
      >
        <UIcon name="i-lucide-plus" class="h-6 w-6 shrink-0" />
        <span
          class="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-[max-width,opacity] duration-300 ease-[cubic-bezier(0.05,0.7,0.1,1)] group-hover:max-w-[6rem] group-hover:opacity-100 group-focus-visible:max-w-[6rem] group-focus-visible:opacity-100 motion-reduce:transition-none"
        >
          新增链接
        </span>
      </button>
    </Transition>

    <!-- 新增链接弹窗：与后台同一个 LinkForm，行为保持一致 -->
    <UModal v-model:open="formOpen" title="新增链接" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <LinkForm
          :categories="writableCategories"
          :is-submitting="submitting"
          submit-label="创建链接"
          @submit="handleCreate"
          @cancel="formOpen = false"
        />
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { Category, Link as LinkType, LinkFormData, SessionUser } from "~~/shared/types";

const requestFetch = useRequestFetch();
const toast = useAppToast();
const queryCache = useQueryCache();
const { notify } = useDataSync();

useHead({ title: "首页" });

const { data: nav } = useQuery({
  key: qk.nav(),
  query: () =>
    withFallback(
      requestFetch<{ user: SessionUser | null; categories: Category[] }>("/api/nav"),
      { user: null, categories: [] },
    ),
});

const { data: linkData, status } = useQuery({
  key: qk.homeLinks(),
  query: () =>
    withFallback(
      requestFetch<{ data: LinkType[]; total: number }>("/api/links?page=1&pageSize=1000&sort=recent"),
      { data: [], total: 0 },
    ),
});
const pending = computed(() => status.value === "pending");

const user = computed(() => nav.value?.user ?? null);
const isAdmin = computed(() => user.value?.role === "admin");
const categories = computed<Category[]>(() => nav.value?.categories ?? []);
const links = computed<LinkType[]>(() => linkData.value?.data ?? []);
const total = computed(() => linkData.value?.total ?? links.value.length);

/**
 * 可写分类（用于新增链接的下拉）。
 *
 * 规则与 server/utils/permissions.ts 的 assertCanAddLinkToCategory 对齐：
 *   - 管理员：任意分类
 *   - 普通用户：公开且未隐藏的分类，或自己创建的分类
 * 服务端会二次校验，这里只是不把明显写不进去的分类摆出来。
 */
const writableCategories = computed<Array<Pick<Category, "id" | "name">>>(() => {
  const current = user.value;
  if (!current) return [];
  const admin = current.role === "admin";
  const out: Array<Pick<Category, "id" | "name">> = [];

  for (const parent of categories.value) {
    const children = parent.children ?? [];
    const candidates = [
      { id: parent.id, name: parent.name, isPublic: parent.isPublic, isHidden: parent.isHidden, userId: parent.userId },
      ...children.map((child) => ({
        id: child.id,
        name: `${parent.name} / ${child.name}`,
        isPublic: child.isPublic,
        isHidden: child.isHidden,
        userId: child.userId,
      })),
    ];
    for (const cat of candidates) {
      const writable = admin || (cat.isPublic && !cat.isHidden) || cat.userId === current.id;
      if (writable) out.push({ id: cat.id, name: cat.name });
    }
  }
  return out;
});

/** 有至少一个可写分类才显示「新增链接」按钮 */
const canAddLink = computed(() => writableCategories.value.length > 0);

const { query: liveQuery } = useLiveSearch();
const filtered = computed(() => {
  const q = liveQuery.value.trim();
  return q ? links.value.filter((link) => matchLink(link, q)) : links.value;
});
const shownCount = computed(() => (liveQuery.value.trim() ? filtered.value.length : total.value));

const view = useState<"card" | "compact">("links-view", () => "card");
onMounted(() => {
  if (localStorage.getItem("links-view") === "compact") view.value = "compact";
});

function toggleView() {
  view.value = view.value === "card" ? "compact" : "card";
  localStorage.setItem("links-view", view.value);
}

const formOpen = ref(false);
const submitting = ref(false);

function openCreate() {
  formOpen.value = true;
}

function errorMessage(error: unknown, fallback: string): string {
  return (error as { data?: { error?: string } })?.data?.error || fallback;
}

async function handleCreate(data: LinkFormData) {
  submitting.value = true;
  try {
    await $fetch("/api/links", { method: "POST", body: data });
    toast.success("链接已创建");
    formOpen.value = false;
    // 失效 links 根（覆盖 homeLinks）+ nav（分类计数变化）+ dashboard 统计
    await queryCache.invalidateQueries({ key: ["links"] });
    await queryCache.invalidateQueries({ key: ["nav"] });
    await queryCache.invalidateQueries({ key: ["dashboard"] });
    notify("Link");
  } catch (error) {
    toast.error(errorMessage(error, "创建失败"));
  } finally {
    submitting.value = false;
  }
}
</script>
