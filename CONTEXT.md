# CONTEXT.md — 项目共识与领域知识

> 本文件是 agent 与人共享的「项目现状记忆」。权限/可见性逻辑以本文 + `src/lib/permissions.ts` 为准。
> 历史设计文档在 `docs/plans/`，本文只保留结论与指针。

## 部署环境约束（影响所有缓存/失效决策）

**部署在 Vercel**（`vercel-build` 脚本确认），DB 为 PostgreSQL（serverless PG）。关键事实：

1. API routes = serverless 函数，**多实例水平扩缩容，实例间内存不共享**。`cache.ts` 的内存 Map 只在 warm 实例内有效；`invalidateByPrefix` 只清写请求命中的那个实例——**失效机制在生产环境根本不工作**
2. 响应返回后微任务不保证执行（`_scheduleRefresh` 后台刷新是伪功能）
3. 由此存在 P0 bug 链：写操作 → 其他 warm 实例 30s TTL 内返回旧数据 → 客户端 `setLocalVersion(新版本)` 与旧数据错位对齐 → **永久陈旧直到下次版本变更**

架构决策（2026-08-29）：**serverless 上失效不如代数**。采用版本化缓存键方案（见优化方向），删除整个失效子系统。

## 项目概览

OneNav：Next.js 导航站。数据层 Prisma（Link / Category / User），认证 NextAuth（JWT），服务端内存缓存（Map，键含用户维度）。

## 领域词汇表

| 术语 | 含义 |
|------|------|
| **role** | 用户角色，存 DB + JWT：`admin` / `user`。`jwt` callback 每 30s 与 DB 对账（角色即时生效）；`tokenVersion` 用于强制下线 |
| **scope** | 视图场景：`home`（前台首页/分类页）/ `manage`（管理后台）。查询条件与缓存键都带此维度 |
| **isPublic** | Category 的公开标志。公开分类任意登录用户可写入 |
| **isPrivate** | Link 的私有标志。私有链接仅所有者（及其视野内）可见 |
| **anon** | 未登录用户。缓存键中 userId 归一化为 `anon` |
| **有效可见性** | 链接可见 = `!link.isPrivate && link.category.isPublic`。**私有分类下的链接一律视作私有**，即使链接本身非私有 |

## 权限分配逻辑（单一真源：`src/lib/permissions.ts`）

所有「某用户能看到/操作哪些数据」的判断统一走此模块：API where 条件、统计口径、搜索、客户端过滤均复用。

### 四个决策点

| 决策点 | 函数 | 规则 |
|--------|------|------|
| 分类可见 | `buildCategoryWhere(userId)` | anon→仅公开；登录（含 admin）→公开+自己的私有 |
| 链接可见 | `buildLinkWhere(scope, userId, role)` | 见下方矩阵 |
| 分类编辑/删除 | `canManageCategory(session, category)` | admin→任意公开+自己的私有（**不能动他人私有分类**）；user→仅自己创建的 |
| 向分类加链接 | `canAddLinkToCategory(session, category)` | admin→任意；user→任意公开+自己的私有 |
| 管理接口 | `adminOnly(session)` | 仅 `admin`（如 `/api/users`、`/api/settings`），否则 401/403 |

### 链接可见矩阵（`buildLinkWhere`）

| 场景 | anon | user | admin |
|------|------|------|-------|
| home | 公开链接 + 公开分类 | 自己全部 + 他人公开（且分类公开） | 同 user（分支冗余，可合并） |
| manage | 需登录 | **仅自己的全部**（公开+私有） | 自己全部 + 他人公开（且分类公开） |

**设计意图**：admin 在 manage 场景也**看不到他人的私有链接/分类**——隐私优先于管理便利，是有意为之，不是 bug。

### 缓存层的权限投影（`src/lib/cache-keys.ts`）

- 键结构（版本化）：`links:v2:ver{N}:user:{uid|anon}:{pub|mgmt}:{catId|all}:p{page}:{sort}`；分类/计数/仪表盘键同带 user + ver 维度
- 不变量：任何键必带 `ver` 段；任何写操作必须 `await incrementTableVersion`（版本即失效信号，无主动清除）

## 三端数据交互（CRUD 全链路）— 2026-08-29 重构后现状

### 读路径（缓存优先，三级穿透）

```
Hook (useDataCache / useInfiniteScroll)
  ① 同步读 localStorage (readPageCache) → 立即渲染
  ② 后台比对版本号: /api/cache-version → DB(AppSetting: version:{Table})
  ③ 版本不一致才 fetch → API → getTableVersion 构造版本化键 → SWR(内存 Map) → Prisma → DB
```

### 写路径（以 POST /api/links 为例）

```
客户端 setItems 乐观更新（内存 state）
  → API: 权限校验 → DB 写入
  → await incrementTableVersion("Link")   // 单条原子 SQL，响应返回前完成
  → 响应返回 → notifyDataChanged("Link")  // BroadcastChannel + storage 广播
  → 其他页面：版本比对不一致 → useDataCache.syncData() / useInfiniteScroll.refresh() 真正重拉
  → 写方本 tab：广播不回传发送者（BroadcastChannel/storage 天然排除），乐观 UI 保持；
    localStorage 版本保持旧值 → 刷新时版本不一致 → 重拉覆盖旧缓存
```

### 一致性机制分工

| 层 | 机制 | 职责 |
|----|------|------|
| 服务端缓存失效 | **版本化缓存键**（`links:v2:ver{N}:...`），无主动失效 | 写操作递增版本 → 全实例天然 miss（Vercel 多实例安全） |
| 客户端↔服务端 | 表级版本号（AppSetting） | 判断 localStorage 是否过期，**三端一致性的锚点** |
| 客户端↔客户端 | BroadcastChannel + storage 广播 | 写方 sync 版本后广播；其他页面真正重拉 |

### 关键设计约束（改动前必读）

- **版本号读取（`getTableVersion`）禁止缓存**：它是缓存键的构造依据，缓存它会拿旧键→旧数据
- **写路径必须 `await incrementTableVersion`**：响应先返回会让客户端拿到旧版本号
- `writePageCache` 内部隐式 `setLocalVersion`——"写缓存即同步版本"的耦合是防御性注释的根源
- **写方绝不能 sync 自己的本地版本号**（2026-08-29 回归教训）：乐观更新只改内存 state，localStorage 分页缓存仍是旧数据；若对齐版本号，刷新时"版本一致"会信任旧缓存。广播机制天然不回传发送者页面，写方收不到自己的广播
- 广播回调**不写本地缓存**：防止把本地版本同步成最新导致刷新时读到旧缓存
- 空缓存不可信任（历史上出过瞬时错误写入空缓存的坑，init 有防御）

## 已知缺陷（2026-08-29 修复后剩 1 项开放）

1. ~~search POST 分类搜索越权~~ ✅ 已修：改走 `buildCategoryWhere` + 只返回安全字段
2. ~~`prefixPublicUser` 失效键错位~~ ✅ 随失效子系统删除而消灭
3. ~~`buildLinkWhere` home admin/user 分支冗余~~ ✅ 已合并
4. ~~广播接收端空转~~ ✅ 已修：接收端版本不一致真正重拉；写方 `notifyDataChanged` 内部先 sync 版本
5. ~~`queries.ts` 手写复制权限 where~~ ✅ 已收口到 `buildCategoryWhere`/`buildLinkWhere`
6. ~~版本号 fire-and-forget + 低效~~ ✅ 已修：await + 单条 `INSERT ... ON CONFLICT ... RETURNING`
7. **localStorage `nav_cache_*` 无淘汰**（开放）：分页键累积无上限，逼近 5MB 配额时静默降级
8. ~~`optimisticAddToCache` 无效写~~ ✅ 已删除（乐观 UI 统一走 Hook 的 setItems/setData）
9. ~~服务端 SWR 失效竞态~~ ✅ 随失效子系统删除而消灭
10. ~~编辑链接后客户端 createdAt 倒序重排列表~~ ✅ 已修：`LinksGrid.sortLinks` 与服务端排序一致，仅置顶变化才重排
11. ~~搜索页拖拽污染全局 sortOrder~~ ✅ 已修：`draggable={false}`，派生视图禁拖
12. ~~sortOrder 分类内/全局双轨~~ ✅ 已修：统一用户内全局编号 + 迁移脚本（方案 A）

## 优化方向（2026-08-29 已全部实施，剩低优先级 3 项）

**已实施——系统性重构：版本化缓存键取代失效子系统**（方案对比：A 删服务端缓存—性能倒退 / B Upstash Redis—过度工程，均否决）：

- 键结构 `links:v2:ver{N}:user:{uid}:{scope}:...`，版本号由 `getTableVersion` 直查 DB（禁止缓存）
- `invalidateLinks`/`invalidateCategories`/`invalidateAll`/`invalidateUsers` 及全部前缀函数已删除
- `incrementTableVersion`：await 化 + 单条 `INSERT ... ON CONFLICT ... RETURNING`（每键 1 次 DB 往返）
- `/api/cache-version` 读路径去掉 upsert 写放大；users 列表（admin 低频）去缓存直查 DB
- `queries.ts` 读路径已收口到 `buildCategoryWhere`/`buildLinkWhere`；`buildLinkWhere` 冗余分支已合并
- search POST 分类越权已修；广播接收端已补真正重拉；`optimisticAddToCache`/`rollbackCache` 死代码已删

**低优先级（未实施）**：
1. localStorage LRU 淘汰（唯一开放缺陷 7）
2. 权限规则表驱动（身份×场景×操作矩阵数据化 + 解释器）
3. 客户端缓存收口：解耦"writePageCache 隐式 setLocalVersion"，版本语义显式化

## 图标（favicon）获取逻辑 — 设计约定（2026-08-29 与用户对齐）

**faviconsnap（独立项目）是唯一的图标获取引擎，只在录入时运行一次**：

```
添加/编辑链接 → LinkForm 自动识别 → /api/links/recognize
  → recognize-url.ts buildFaviconProxyUrl(): 无条件生成
    https://faviconsnap.com/api/favicon?url={origin}&size=64
  → 存入 Link.favicon
展示时 → LinkCard 只读库渲染：faviconsnap URL 直连 <img>；
  其他来源的 favicon URL 走 /api/favicon 服务端代理（防盗链头 + 魔数/SVG 判定 + 失败日志）
  → onError 仅本次会话回退默认图标，不写 localStorage、无运行时解析/回退链
```

**禁止**：展示层做运行时图标解析/回退链/broken 标记（2026-08-29 曾误加 hunter.io 回退与 localStorage broken 标记，已按用户设计删除）。
已知边界：faviconsnap 对反爬极强的站点（如 wenshu.court.gov.cn）可能抓不到 → 该类链接显示默认图标属预期，可在编辑对话框手动填图标 URL 覆盖。

## 排序（sortOrder）体系 — 2026-08-29 统一为「用户内全局编号」（方案 A）

**规则（改动排序相关代码前必读）**：
- `sortOrder` = 该用户内全局唯一、从 0 连续递增（**不是分类内编号**）
- 服务器展示排序固定：`isPinned desc → sortOrder asc → createdAt asc`（createdAt 是 tie-breaker，禁止移除）
- 新建/导入链接：取**用户内** `max(sortOrder)+1` 追加到末尾（`POST /api/links`、`import/route.ts`）
- 拖拽重排（`/api/links/reorder`）：按当前视图全局重编号 0..N，保持置顶分组
- 客户端（`LinksGrid.sortLinks`）排序必须与服务端完全一致；**禁止用 createdAt 倒序重排客户端列表**（与 sortOrder 升序相反，曾导致编辑后列表错乱）

**使用边界（2026-08-29 修复）**：
- 搜索页禁止拖拽（`LinksGrid draggable={false}`）——搜索结果是从全量抽取的子集，拖拽重编号会污染全局顺序
- 分页视图（首页/分类页无限滚动）的拖拽只重编号已加载项——属已知限制；未来若需严格支持可限制「!hasMore 才可拖」

**历史问题**：创建时按分类内编号（每分类从 0 开始）与拖拽全局重编号双轨混用 → 新建链接可能插到列表中间；已迁移修复。
**迁移脚本**：`scripts/migrate-sort-order.ts`（幂等，按展示顺序重编号 0..N；**生产部署后需在 Vercel 环境执行一次**）。

## 文档指针

- `docs/plans/2026-08-20-visibility-consistency-design.md` — 权限/搜索/缓存单一来源化改造（`lib/search.ts`、`lib/cache-keys.ts` 的由来）
- `docs/plans/2026-08-20-shadcn-ui-unification-*.md` — UI 统一改造（与数据层无关）
- `src/lib/permissions.ts` — 权限规则真源
- `src/lib/cache-keys.ts` — 缓存键真源
