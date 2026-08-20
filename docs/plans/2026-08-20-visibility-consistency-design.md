# P0 可见性一致性改造 — 设计文档

> 日期：2026-08-20
> 状态：设计中（待用户批准）
> 技能流程：superpowers → Brainstorming（已确认 3 项决策）→ 本文档 → Plan → 实现

## 背景与问题

当前 OneNav 的「链接可见性 / 权限 / 搜索 / 缓存」规则散落在多处，存在三处一致性缺陷：

1. **搜索逻辑重复**：`src/app/api/search/route.ts`（GET）与 `src/lib/queries.ts` 的 `searchLinks` 各自实现了几乎相同的「可见性过滤 + 文本匹配 + 打分排序」逻辑。任一处改规则，另一处会漏改，导致 AI 搜索与规则搜索结果不一致。
2. **缓存键命名混乱 + 失效不可靠**：`queries.ts` 内同时存在 `links:cat:${userId}`、`links:api:v2:${scopeKey}:...`、`links:home:recent` 三套命名。`invalidateLinks` 注释明确写道「无法枚举用户，只能全量清 `links:*`」。这导致：
   - 失效不精确，可能影响无关数据；
   - 私有数据缓存可能残留（多用户共享 `links:*` 前缀时，非所有者可能命中别人的私有缓存键）。
3. **分类页越权拉取**：`src/components/CategoryContentClient.tsx` 拉 `/api/links?includePrivate=true`（全量 + 越权），再在客户端 `allLinks.filter(l => l.categoryId === id)`。API 已支持 `categoryId` 参数却未用，且 `includePrivate=true` 会让前端能拉到别人的私有链接（靠前端 filter 兜底，有数据泄露风险）。

## 目标

- 可见性 / 权限 / 搜索规则**单一来源**，所有调用方共用。
- 缓存失效**按用户前缀精确清除**，杜绝跨用户私有数据残留。
- 分类页**按 `categoryId` + 正确 `scope` 分页查询**，复用统一权限与分页，移除越权与全量拉取。

## 已确认的设计决策

| # | 决策点 | 选择 |
|---|--------|------|
| 范围 | ①②③ 全做 | ✅ |
| 缓存键 | 结构化 `links:v1:user:{id}:*` + 前缀失效 | ✅ |
| 搜索 | 独立 `lib/search.ts` 深层模块 | ✅ |

## 设计详情

### 模块 1：`lib/search.ts`（深层模块，统一搜索）

**接口（caller 必须知道的事实）：**

```ts
type SearchOptions = {
  scope?: "home" | "manage";   // 默认 "home"
  limit?: number;              // 默认 50
  includeCategories?: boolean; // 是否同时搜分类名（POST 用），默认 false
};

function buildSearchWhere(userId: string | undefined, userRole: string | undefined, q: string): Prisma.LinkWhereInput;
// 返回：可见性（复用 permissions.buildLinkWhere 的语义）+ 文本 OR 匹配（title/description/url contains）

function scoreAndSort(links: Link[], q: string): Link[];
// 纯函数：title +3 / url +2 / description +1，置顶优先，返回排序后数组。无副作用，可单测。

async function searchLinks(q: string, userId?: string, userRole?: string, opts?: SearchOptions): Promise<Link[]>;
// 组合 buildSearchWhere + prisma.findMany + scoreAndSort，返回截断到 limit 的结果。
```

**实现深度：**
- `buildSearchWhere` 直接调用 `permissions.buildLinkWhere(scope, userId, userRole)` 作为可见性基底，再 `AND` 文本匹配。这样权限规则只有 `permissions.ts` 一处真源。
- `scoreAndSort` 是纯函数，从 `queries.searchLinks` 与 `api/search/route.ts` 两处抽出来的**唯一副本**。
- 旧 `queries.searchLinks` 改为调用 `searchLinks`；`api/search/route.ts` 的 GET / POST 改为调用 `searchLinks` / `buildSearchWhere` + `scoreAndSort`。

**删除测试（deletion test）：** 删掉 `lib/search.ts`，调用方（API + queries）的搜索行为全部退回重复代码——证明它「有存在价值」。

### 模块 2：`lib/cache-keys.ts`（结构化键生成器）

**接口：**

```ts
function linkListKey(userId: string | null, scope: "home" | "manage", categoryId?: string | null, page?: number, sort?: string): string;
// 形态：links:v1:user:{id|anon}:{scope}:{catId|all}:p{page}:{sort}

function categoryKey(userId: string | null): string;
// 形态：categories:v1:user:{id|anon}

function linkCountKey(userId: string | null): string;
// 形态：links:count:v1:user:{id|anon}

function prefixByUser(userId: string | null): string;
// 形态：links:v1:user:{id|anon}:  → 失效时只清该用户前缀
```

**实现深度：** 纯字符串拼接，无副作用。所有 `queries.ts` / API 路由里手写缓存键的地方改为调用此生成器。

**失效策略改写（`queries.ts` 的 `invalidateLinks` / `invalidateCategories`）：**

> ⚠️ 修正（2026-08-20 校准）：实际代码里 `links/route.ts` 的列表键已是
> `links:api:v2:${scopeKey}:${uid}:${categoryId}:p${page}:${sort}`，且 `_home`/链接列表有
> `home`(公开浏览) 与 `manage`(后台) 两种 scope；公开视图对每个登录用户有独立键
> `pub:${userId}` 与 `anon`。因此「只清 anon」会漏掉登录用户自己的 `pub:${userId}` 公开视图。

- 不再 `invalidateByPrefix("links")` / `invalidateByPrefix("links:cat:")` 等暴力全清。
- `invalidateLinks(userId, categoryId?)` 改为清以下前缀集合：
  - 该用户全部：`invalidateByPrefix(prefixByUser(userId))`（`links:v1:user:${userId}:`）
  - 匿名公开视图：`invalidateByPrefix(prefixPublicAnon())`（`links:v1:user:anon:`）
  - 登录用户的公开视图（自己浏览公开页）：`invalidateByPrefix(prefixPublicUser(userId))`（`links:v1:user:pub:${userId}:`）
  - 精确分类（当 categoryId 给定）：`deleteCached(linkListKey(userId, scope, categoryId, ...))` 对所有 scope 变体
  - 若 categoryId 变化且操作者为管理员编辑他人链接：额外清管理员的 `prefixByUser(adminId)`
- `invalidateCategories()` 改为清 `categories:v1:user:${userId}:`、`categories:v1:user:anon:`、`dashboard:stats:${userId}`，不再 `invalidateByPrefix("links")`（链接归类展示由上面的链接前缀覆盖）。
- 关键不变量：**永不** `invalidateByPrefix("links")` 这种无 user 维度前缀，确保其他登录用户的私有缓存不受影响。

### 模块 3：`CategoryContentClient.tsx`（按 ID 查询）

**改造：**
- 移除 `fetch('/api/links?includePrivate=true')` 全量拉取 + 客户端 filter。
- 改为通过 `useInfiniteScroll` 传 `fetchFn`，请求 `/api/links?categoryId=${categoryId}&scope=home&page=...&pageSize=...`。
- API `links/route.ts` 已支持 `categoryId` 与 `scope`，且 `buildLinkWhere(scope, userId, role)` 已正确限制可见性（未登录只看公开、登录看自己+别人公开、私有分类不对非所有者公开）。客户端不再需要 `includePrivate=true`，越权泄露消除。
- 分类树（含 slug 查找）仍由 `useDataCache` 的 `Category` 提供，仅用于定位当前分类的 `categoryId`，不用于过滤链接。
- 子分类区块逻辑保持不变。

## 影响文件

| 文件 | 改动 |
|------|------|
| `src/lib/search.ts` | **新增**：统一搜索深层模块 |
| `src/lib/cache-keys.ts` | **新增**：结构化缓存键生成器 |
| `src/lib/queries.ts` | 用 `search.ts` 替换 `searchLinks` 内联逻辑；`invalidateLinks` / `invalidateCategories` 改用 `cache-keys.ts` 前缀失效；`getCategories` / `getAllLinks` / `getLinkCount` 改用新键 |
| `src/app/api/search/route.ts` | GET / POST 改用 `search.ts` |
| `src/app/api/links/route.ts` | 缓存键改用 `cache-keys.ts` 生成器 |
| `src/app/api/categories/route.ts` | 分类列表键改用 `cache-keys.ts`（`categories:v1:user:${uid}:${scope}`） |
| `src/app/api/dashboard/stats/route.ts` | stats 键改用 `cache-keys.ts`（`dashboard:stats:v1:${userId}`） |
| `src/components/CategoryContentClient.tsx` | 改为按 `categoryId` 分页查询 |
| `src/lib/permissions.ts` | 不动（已是权限真源，仅被复用） |

## 非目标（YAGNI）

- 不做 Redis 多进程缓存迁移（仅注释提醒，本改造不引入）。
- 不新增 AI 搜索模式开关（留给后续 P2 功能增强）。
- 不改动 `useInfiniteScroll` / `useDataCache` 的通用缓存机制，只改键的「形状」与「失效范围」。

## 风险与缓解

- **缓存键改名导致旧缓存失效**：可接受，下次访问自动重建；旧键在 Map 中成为孤儿，无副作用。
- **`CategoryContentClient` 改为分页后首屏加载节奏变化**：复用现有 `useInfiniteScroll` 的缓存优先渲染，体验不降级。
- **公开视图失效遗漏**：保留 `links:v1:user:anon:` 前缀失效，覆盖未登录公开浏览。

## 验收标准

1. 搜索规则（可见性 + 打分）只存在于 `lib/search.ts` 一处，API 与 query 层无重复。
2. 任一用户写入/删除链接后，仅该用户（及 anon 公开视图）的链接缓存被清，其他登录用户的私有缓存不受影响。
3. 分类页网络请求带 `categoryId` 参数，响应中不含当前用户无权查看的私有链接（用管理员/普通用户/匿名三种身份验证）。
4. 现有首页、分类页、搜索页、后台列表功能正常，无回归。
