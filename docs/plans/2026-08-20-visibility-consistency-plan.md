# P0 可见性一致性改造 — 实现计划

> 日期：2026-08-20
> 依赖设计：2026-08-20-visibility-consistency-design.md（已批准，含缓存失效修正）
> 流程：superpowers → Plan（本文档）→ 实现（subagent 驱动 / 直接编辑）

## 任务拆分（按依赖顺序）

### T1 — `lib/cache-keys.ts`（基础模块，无依赖）
新增结构化键生成器 + 失效辅助。所有后续模块依赖它。
- `linkListKey(userId, scope, categoryId?, page?, sort?)` → `links:v1:user:{id|anon}:{scope}:{catId|all}:p{page}:{sort}`
- `categoryKey(userId, scope)` → `categories:v1:user:{uid}:${scope}`
- `linkCountKey(userId)` → `links:count:v1:user:{id|anon}`
- `dashboardStatsKey(userId)` → `dashboard:stats:v1:${userId}`
- `prefixByUser(userId)` → `links:v1:user:${id|anon}:`
- `prefixPublicAnon()` → `links:v1:user:anon:`
- `prefixPublicUser(userId)` → `links:v1:user:pub:${userId}:`
- 纯函数，无副作用，导出供测试。

### T2 — `lib/search.ts`（深层搜索模块，依赖 permissions）
- `buildSearchWhere(userId, role, q)`：复用 `permissions.buildLinkWhere("home", userId, role)` 作可见性基底，`AND` 文本 OR 匹配（title/url/description contains，大小写不敏感）。
- `scoreAndSort(links, q)`：纯函数，title+3/url+2/description+1，pinned 优先，稳定排序，截断由调用方控制。
- `searchLinks(q, userId?, role?, opts?)`：组合二者，`prisma.link.findMany` + `scoreAndSort` + limit。
- 从 `queries.searchLinks` 与 `api/search/route.ts` 抽取打分逻辑，只保留这一份。

### T3 — `lib/queries.ts`（接入 T1+T2，替换内联逻辑）
- `searchLinks`：改调 `lib/search.ts` 的 `searchLinks`（保持签名兼容）。
- `getAllLinks(userId)`：缓存键改 `linkListKey` 对应的 `links:all` 结构 → 直接用 `prefixByUser` 语义键。
- `getCategories / getLinkCount`：缓存键改 `categoryKey` / `linkCountKey`。
- `invalidateLinks(userId, categoryId?)`：按设计修正后的前缀集合失效（见设计文档模块 2），**删除**所有 `links:cat:` / `links:api:v2:` / `invalidateByPrefix("links")` 旧前缀逻辑。
- `invalidateCategories()`：改清 `categoryKey` 前缀 + `dashboardStatsKey` 前缀，移除 `invalidateByPrefix("links")`。
- `invalidateLinksWithOldCategory`：改走 T1 前缀集合。
- `reorderLink` / 其他写操作：调用 `invalidateLinks` 即可，逻辑不变。

### T4 — `api/links/route.ts`（接入 T1）
- `GET` 的 `cacheKey` 改用 `linkListKey(userId, scope, categoryId, page, sort)`。

### T5 — `api/categories/route.ts`（接入 T1）
- `GET` 的 `cacheKey` 改用 `categoryKey(userId, scope)`。

### T6 — `api/dashboard/stats/route.ts`（接入 T1）
- `cacheKey` 改用 `dashboardStatsKey(userId)`。

### T7 — `api/search/route.ts`（接入 T2）
- GET：`buildSearchWhere` + `scoreAndSort`（替换内联 `buildVisibilityFilter` / `buildTextFilter` / `buildScoreOrderBy`）。
- POST：调用 `searchLinks(...)`。

### T8 — `CategoryContentClient.tsx`（修越权，接入分页）
- 移除 `fetch('/api/links?includePrivate=true')` 全量 + 客户端 filter。
- `useInfiniteScroll` 的 `fetchFn` 改为 `GET /api/links?categoryId=${id}&scope=home&page=&pageSize=`，复用 `buildLinkWhere` 权限（不再带 `includePrivate`）。
- 分类树定位仍用 `useDataCache` 的 `Category`。
- 子分类区块渲染逻辑保持不变。

## 测试策略

**单元（纯函数，无需 DB）：**
- `lib/search.ts`：`buildSearchWhere` 对匿名/普通用户/管理员生成正确的可见性基底 + 文本 OR；`scoreAndSort` 排序权重与 pinned 优先顺序；空 query 不报错。
- `lib/cache-keys.ts`：键格式正确；`prefixByUser` 对 null→anon；`prefixPublicUser` 区分 pub 视图。

**集成 / 行为（需 DB 或 mock prisma）：**
- `invalidateLinks` 失效后，仅目标用户 + anon + 该用户 pub 视图被清；**断言其他登录用户的私有缓存键仍存在**（核心不变量）。
- `CategoryContentClient` 改造后，API 响应不含当前用户无权查看的私有链接（用匿名 / 普通 / 管理三身份验证）。

**回归（手动 / 现有用例）：**
- 首页、分类页、搜索页、后台列表、仪表盘统计均正常，无控制台报错。

## 不变量（实现必须遵守）

1. 搜索可见性规则只存在于 `permissions.buildLinkWhere` + `lib/search.ts` 调用它，API/query 无副本。
2. `invalidateLinks` / `invalidateCategories` **永不**使用无 user 维度的 `links` / `categories` 前缀。
3. 分类页请求不携带 `includePrivate=true`，可见性完全由后端 `buildLinkWhere` 决定。

## 验收对照（来自设计文档）

- [ ] 搜索规则单源
- [ ] 缓存按用户精确失效，跨用户私有不泄露
- [ ] 分类页无越权（三身份验证）
- [ ] 四页面无回归

## 提交单位

按 T1→T8 顺序提交，每步可独立编译。T1+T2 为基础设施，先合；T3~T7 为接入；T8 为前端收尾。
