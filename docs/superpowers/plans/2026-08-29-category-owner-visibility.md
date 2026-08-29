# 分类创建者全权视角（他人链接对分类主人恒可见）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 分类创建者在自己创建的分类下永远能看到所有公开链接（含他人挂入的），私有化不影响其本人视角，分类书签数量不再跳变。

**架构：** 唯一逻辑改动在 `permissions.buildLinkWhere` 的普通用户 home 分支——新增第三个 OR 项「我创建的、未隐藏的分类下的他人公开未隐藏链接」；其余全部是缓存失效处理：服务端 swr 键前缀 bump + 前端 localStorage 缓存名 bump，使旧可见性数据无法被命中。manage 口径（仪表盘统计、分类管理树）、管理员分支、未登录分支、他人私有链接、被隐藏内容一律不动。

**技术栈：** Next.js 16 / Prisma / 服务端 swr 内存缓存（`lib/cache.ts`，版本编进键）/ 客户端 localStorage 版本化缓存（`lib/cache-client.ts`，name + DB 版本号比对）。

**规格文档：** `docs/superpowers/specs/2026-08-29-category-owner-visibility-design.md`

**前置事实（已探明，勿重复调研）：**
- `buildLinkWhere(scope, userId, userRole)` 是权限真源，home 口径被 `queries.ts`（getLinkCount/getAllLinks SSR）、`search.ts`（buildSearchWhere）、`app/api/links/route.ts`、`app/api/categories/route.ts`（links include）、`app/api/categories/[id]/route.ts` 复用；管理页前端按 `categoryId` 纯过滤，后端数据变全后自动生效。
- `app/api/dashboard/stats/route.ts` 用 `buildStatsWhere("manage", ...)` → 普通用户 manage 分支为 `{ userId, isHidden: false }`，**不受本轮影响**，`dashboardStatsKey` 不 bump。
- `/api/cache-version?table=X` 对不存在行返回 0。前端 `name: "Category:v3"` 配置无 `versionTable` → `versionKey = "Category:v3"` → 版本比对永远 miss（每次重拉）→ 当前分类树缓存本就「每次重拉」，但**链接缓存 `name:"Link"` 有 `versionTable:"Link"` 会真实命中旧缓存**，必须 bump。
- 项目无测试框架（无 vitest/jest、无 `*.test.ts`）。验证 = `pnpm build` + `pnpm lint` + 端到端手工验证。

---

## 文件结构

| 文件 | 职责 | 改动类型 |
|---|---|---|
| `src/lib/permissions.ts` | 权限真源：`buildLinkWhere` 普通用户 home 分支新增第 3 个 OR 项 | 逻辑改动 |
| `src/lib/cache-keys.ts` | 服务端 swr 键前缀：`links:v2→v3`、`links:count:v2→v3`、`categories:v3→v4`（`dashboard:stats` 不动） | 缓存失效 |
| `src/components/HomeContentClient.tsx` | `name: "Link"→"Link:v2"`；`"Category:v3"→"Category:v4"` 并补 `versionTable: "Category"` | 前端缓存 |
| `src/components/CategoryContentClient.tsx` | 同上两处 | 前端缓存 |
| `src/components/SearchContent.tsx` | `"Category:v3"→"Category:v4"` 并补 `versionTable: "Category"` | 前端缓存 |
| `src/app/dashboard/import-export/page.tsx` | 硬编码 `readPageCache`/`writePageCache` 的 `"Category:v3"→"Category:v4"` | 前端缓存 |
| `src/app/dashboard/links/page.tsx` | `name: "Link"→"Link:v2"` | 前端缓存 |
| `src/app/dashboard/categories/page.tsx` | `name: "Link"→"Link:v2"`（`"Category:mgmt:v3"` 不动） | 前端缓存 |

**明确不动：** `dashboardStatsKey`、`Category:mgmt:v3`、`queries.ts` 逻辑、`search.ts` 逻辑、三个 API 路由（它们的 where 来自 `buildLinkWhere` 自动生效）。

---

## 任务 1：buildLinkWhere 新增「我创建的分类下的他人公开链接」

**文件：**
- 修改：`src/lib/permissions.ts:160-167`（普通用户 home 分支）
- 修改：`src/lib/permissions.ts:128-139`（函数头注释表格）

- [ ] **步骤 1：修改普通用户 home 分支为 3 个 OR 项**

把 `src/lib/permissions.ts` 第 160-166 行：

```ts
  // 登录普通用户 home：自己的全部 + 别人的公开（均排除隐藏）
  return {
    OR: [
      { userId, isHidden: false },
      { isPrivate: false, isHidden: false, category: { isPublic: true, isHidden: false } },
    ],
  };
```

替换为：

```ts
  // 登录普通用户 home：自己的全部 + 别人的公开（均排除隐藏）
  return {
    OR: [
      { userId, isHidden: false }, // 自己的全部（现状）
      // 他人的公开链接，且其所属分类是公开的（现状）
      { isPrivate: false, isHidden: false, category: { isPublic: true, isHidden: false } },
      // 新增：我创建的分类下的他人公开链接（分类私有化后对创建者仍可见，数量不跳变）
      { isPrivate: false, isHidden: false, category: { userId, isHidden: false } },
    ],
  };
```

第 3 项中 `category: { userId, ... }` 是 Prisma 关系过滤，语义为 `category.userId === 当前用户`（此时 `userId` 已因第 145 行 `if (!userId)` 提前返回而非空）。

- [ ] **步骤 2：更新函数头注释表格的 home 普通用户行**

第 133 行：

```ts
 * | home   | 普通用户       | 自己的全部 + 别人的公开（均排除隐藏）|
```

改为：

```ts
 * | home   | 普通用户       | 自己的全部 + 别人的公开 + 自己分类下的他人公开（均排除隐藏）|
```

- [ ] **步骤 3：运行 lint 确认无类型错误**

运行：`pnpm lint`
预期：PASS（无 error；若本地有存量 warning 属正常，不引入新问题即可）

- [ ] **步骤 4：Commit**

```bash
git add src/lib/permissions.ts
git commit -m "feat(permissions): 分类创建者全权视角——他人公开链接对分类主人恒可见"
```

---

## 任务 2：服务端缓存键前缀 bump

**文件：**
- 修改：`src/lib/cache-keys.ts:40`（`linkListKey`）
- 修改：`src/lib/cache-keys.ts:48`（`categoryKey`）
- 修改：`src/lib/cache-keys.ts:53`（`linkCountKey`）
- 修改：`src/lib/cache-keys.ts:12-15`（文件头键结构注释）

- [ ] **步骤 1：bump 三个键前缀**

`linkListKey`（第 40 行）返回值：
```ts
  return `links:v2:ver${version}:user:${uid}:${scopeKey}:${cat}:p${page}:${sort}`;
```
改为：
```ts
  return `links:v3:ver${version}:user:${uid}:${scopeKey}:${cat}:p${page}:${sort}`;
```

`categoryKey`（第 48 行）返回值：
```ts
  return `categories:v3:ver${version}:user:${uid}:${scopeKey}`;
```
改为：
```ts
  return `categories:v4:ver${version}:user:${uid}:${scopeKey}`;
```

`linkCountKey`（第 53 行）返回值：
```ts
  return `links:count:v2:ver${version}:user:${normUid(userId)}`;
```
改为：
```ts
  return `links:count:v3:ver${version}:user:${normUid(userId)}`;
```

`dashboardStatsKey`（第 57-59 行）**保持 `dashboard:stats:v2` 不动**（manage 口径不受本轮影响）。

- [ ] **步骤 2：更新文件头键结构注释（第 12-15 行）**

```ts
 * 键结构约定：
 *   links:v3:ver{N}:user:{uid|anon}:{pub|mgmt}:{catId|all}:p{page}:{sort}
 *   categories:v4:ver{N}:user:{uid|anon}:{pub|mgmt}
 *   links:count:v3:ver{N}:user:{uid|anon}
 *   dashboard:stats:v2:ver{N}:{userId}
```

- [ ] **步骤 3：运行 lint**

运行：`pnpm lint`
预期：PASS

- [ ] **步骤 4：Commit**

```bash
git add src/lib/cache-keys.ts
git commit -m "chore(cache): bump 链接/分类缓存键前缀，旧可见性缓存天然失效"
```

---

## 任务 3a：首页 + 分类页前端缓存名 bump

**文件：**
- 修改：`src/components/HomeContentClient.tsx:34` 与 `:47`
- 修改：`src/components/CategoryContentClient.tsx:48` 与 `:71`

- [ ] **步骤 1：HomeContentClient 的分类配置**

`src/components/HomeContentClient.tsx` 第 32-44 行的 config：

```ts
    {
      name: "Category:v3",
      fetch: () =>
        fetch("/api/categories")
```

改为（补 `versionTable: "Category"`，使版本比对真正锚定 `version:Category`）：

```ts
    {
      name: "Category:v4",
      versionTable: "Category",
      fetch: () =>
        fetch("/api/categories")
```

同时第 58 行 `const categories = Array.isArray(catData["Category:v3"])` 改为 `catData["Category:v4"]`（注意：`useDataCache` 返回的 `data` 以 `name` 为索引）。

- [ ] **步骤 2：HomeContentClient 的链接配置**

第 47 行 `name: "Link",` 改为 `name: "Link:v2",`（`versionTable` 未显式传，但 `useInfiniteScroll` 默认取 name 为 versionKey——此处必须补 `versionTable: "Link"`，否则 versionKey 变 `"Link:v2"` 后 `/api/cache-version` 返回 0，版本比对失效）：

```ts
  const { items: links, total, hasMore, isLoadingMore, loading: linksLoading, sentinelRef } = useInfiniteScroll<LinkType>({
    name: "Link:v2",
    versionTable: "Link",
    userId,
```

- [ ] **步骤 3：CategoryContentClient 的分类配置**

`src/components/CategoryContentClient.tsx` 第 48-50 行：

```ts
      name: "Category:v3",
      fetch: () =>
        fetch("/api/categories")
```

改为：

```ts
      name: "Category:v4",
      versionTable: "Category",
      fetch: () =>
        fetch("/api/categories")
```

第 60 行 `catData["Category:v3"]` 同步改为 `catData["Category:v4"]`（第 60 行两处）。

- [ ] **步骤 4：CategoryContentClient 的链接配置**

第 71 行：

```ts
  const { items: allLinks, loading: linksLoading, isLoadingMore, sentinelRef } = useInfiniteScroll<LinkType>({
    name: "Link",
    enabled: !!categoryId,
```

改为：

```ts
  const { items: allLinks, loading: linksLoading, isLoadingMore, sentinelRef } = useInfiniteScroll<LinkType>({
    name: "Link:v2",
    versionTable: "Link",
    enabled: !!categoryId,
```

- [ ] **步骤 5：运行 lint**

运行：`pnpm lint`
预期：PASS

- [ ] **步骤 6：Commit**

```bash
git add src/components/HomeContentClient.tsx src/components/CategoryContentClient.tsx
git commit -m "chore(cache): 首页/分类页缓存名 bump 至 Link:v2 与 Category:v4，并补齐 versionTable"
```

---

## 任务 3b：搜索页 + 导入导出页前端缓存名 bump

**文件：**
- 修改：`src/components/SearchContent.tsx:27`
- 修改：`src/app/dashboard/import-export/page.tsx:37` 与 `:51`

- [ ] **步骤 1：SearchContent 分类配置**

`src/components/SearchContent.tsx` 第 27-29 行：

```ts
      name: "Category:v3",
      fetch: () =>
        fetch("/api/categories")
```

改为：

```ts
      name: "Category:v4",
      versionTable: "Category",
      fetch: () =>
        fetch("/api/categories")
```

第 34 行 `(cacheData["Category:v3"] || [])` 同步改为 `cacheData["Category:v4"]`。

- [ ] **步骤 2：import-export 硬编码键**

`src/app/dashboard/import-export/page.tsx` 第 37 行：

```ts
    const cached = readPageCache<Category>("Category:v3", 1);
```

改为：

```ts
    const cached = readPageCache<Category>("Category:v4", 1);
```

第 51 行：

```ts
        writePageCache("Category:v3", 1, data, data.length, serverVersion || 1);
```

改为：

```ts
        writePageCache("Category:v4", 1, data, data.length, serverVersion || 1);
```

- [ ] **步骤 3：运行 lint**

运行：`pnpm lint`
预期：PASS

- [ ] **步骤 4：Commit**

```bash
git add src/components/SearchContent.tsx src/app/dashboard/import-export/page.tsx
git commit -m "chore(cache): 搜索/导入导出页分类缓存名 bump 至 Category:v4"
```

---

## 任务 3c：链接管理页 + 分类管理页前端缓存名 bump

**文件：**
- 修改：`src/app/dashboard/links/page.tsx:100`
- 修改：`src/app/dashboard/categories/page.tsx:85`

- [ ] **步骤 1：dashboard/links 链接配置**

`src/app/dashboard/links/page.tsx` 第 100-102 行：

```ts
    name: "Link",
    versionTable: "Link",
    userId: uid,
```

改为：

```ts
    name: "Link:v2",
    versionTable: "Link",
    userId: uid,
```

- [ ] **步骤 2：dashboard/categories 链接配置**

`src/app/dashboard/categories/page.tsx` 第 85-87 行：

```ts
    name: "Link",
    versionTable: "Link",
    userId: uid,
```

改为：

```ts
    name: "Link:v2",
    versionTable: "Link",
    userId: uid,
```

**注意：** 同页第 79 行 `name: "Category:mgmt:v3"` **保持不动**（manage 口径，普通用户只看自己的链接，不受本轮影响）。

- [ ] **步骤 3：全仓确认没有遗漏的旧缓存名**

运行：

```bash
rg -n '"Link"|"Category:v3"|"Category:mgmt:v3"|links:v2|links:count:v2|categories:v3' src --glob '!lib/cache-keys.ts'
```

预期：除 `"Category:mgmt:v3"`（保留）与 `lib/cache-keys.ts`（已被任务 2 处理，此处显式排除）外，无任何匹配。

- [ ] **步骤 4：运行 lint**

运行：`pnpm lint`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add src/app/dashboard/links/page.tsx src/app/dashboard/categories/page.tsx
git commit -m "chore(cache): 管理页链接缓存名 bump 至 Link:v2"
```

---

## 任务 4：构建验证

**文件：** 无改动

- [ ] **步骤 1：TypeScript 全量类型检查 + 生产构建**

运行：`pnpm build`
预期：构建成功，无 TS 类型错误（`next build` 内置 type-check）。

- [ ] **步骤 2：lint 复核**

运行：`pnpm lint`
预期：PASS

- [ ] **步骤 3：Commit（如有 lint 修正）**

若上两步出现并修复了问题：

```bash
git add -A
git commit -m "fix: 构建/lint 问题修复"
```

---

## 任务 5：端到端验证（需本地 dev + 双账号数据）

**前置：** 本地 dev 数据库需存在「含他人公开链接的私有化候选分类」。参考线上种子数据：用户 `common` 的分类「普通私有」含 1 条自己的 + 21 条用户 `cmpiqwg7l0000qx9spjdfjq0w` 创建的公开链接。若本地库没有此结构，先用管理员账号向某普通用户创建的公开分类批量添加链接制造场景。

**文件：** 无改动

- [ ] **步骤 1：启动 dev 并登录验证主场景**

运行：`pnpm dev`，浏览器登录分类创建者账号（如 `common`）。
验证：
1. 首页「全部书签 (N)」与分类页数量一致，包含自己分类下的他人公开链接。
2. 进入分类管理页 → 把含他人链接的公开分类设为私有 → 该分类书签数**不跳变**（改动前会从 N 骤降到自己的 N'）。
3. 首页与分类页刷新后数量仍稳定（前端 `Link:v2` / `Category:v4` 缓存拉取新数据）。

- [ ] **步骤 2：隐私边界回归**

1. 用另一普通用户账号登录：看不到该私有分类及其任何内容（含他人挂入的公开链接）。
2. 未登录：同样看不到。
3. 管理员登录：仍看不到普通用户主动设私有的分类（上轮修复不回归）。
4. 若有他人**私有**链接挂在公开分类里：分类私有化后创建者仍不可见（第 3 个 OR 项要求 `isPrivate: false`）。

- [ ] **步骤 3：管理口径回归**

1. 普通用户链接管理页：只显示自己的链接（他人链接不进入管理编辑区）。
2. 仪表盘统计：`totalLinks` 不因分类私有化而变化（manage 口径）。

- [ ] **步骤 4：搜索回归**

分类创建者用关键词搜索自己分类下的他人公开链接，应能命中（`buildSearchWhere` 复用新分支）。

---

## 自检记录（已执行）

**1. 规格覆盖度：**
- 权限分支（规格「权限规则变更」）→ 任务 1
- 服务端缓存键（规格「缓存键 bump」）→ 任务 2
- 前端 name bump（规格勘误后补充）→ 任务 3a/3b/3c
- 构建与手工验证（规格「验证方式」）→ 任务 4/5
- 「明确不做」（不改他人数据/不迁移/不加弹窗）→ 无对应实现任务，符合预期

**2. 占位符扫描：** 无「待定/TODO」；每步含精确文件路径、行号、完整代码、运行命令与预期输出。

**3. 类型/命名一致性：**
- 所有 `name: "Link:v2"` 均带 `versionTable: "Link"`（`HomeContentClient` 原本无显式 `versionTable`，此处在任务 3a 步骤 2 显式补上，避免 versionKey 变成 `"Link:v2"` 后 `/api/cache-version` 返回 0 导致版本比对失效）。
- `useDataCache` 的 `data` 索引与 `name` 同步改名（`catData["Category:v4"]` 两处组件 + 搜索页）。
- `categoryKey` 前缀 `categories:v4` 与前端 `"Category:v4"` 均为「v4」，`linkListKey` 的 `links:v3` 与前端 `"Link:v2"` 分别独立表示服务端键与前缀、前端视图名，互不冲突（上轮先例：`categories:v3` 服务端 + `"Category:v3"` 前端同名）。
- `"Category:mgmt:v3"` 在任务 3c 步骤 3 的 `rg` 检查中被显式豁免，与规格一致。
