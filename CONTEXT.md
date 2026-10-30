# CONTEXT.md — 项目共识与领域知识

> 本文件是 agent 与人共享的「项目现状记忆」。权限/可见性逻辑以本文 + `server/utils/permissions.ts` 为准。
> 历史设计文档在 `docs/plans/`、`docs/superpowers/`，本文只保留结论与指针。

## 部署环境约束（影响所有缓存/失效决策）

**部署在 Vercel**（`vercel-build` = `nuxt build`），DB 为 Neon PostgreSQL。关键事实：

1. `server/api/**` = Nitro serverless 函数，**多实例水平扩缩容，实例间内存不共享**。`server/utils/cache.ts` 的内存 Map 只在 warm 实例内有效，**主动失效在生产环境不可行**
2. 响应返回后微任务不保证执行——后台刷新（`_scheduleRefresh`）已删除，它每次缓存命中都额外触发一次全量查询，是纯 DB 放大
3. 因版本号编进缓存键，同一 key 的数据永不变化，**命中直接返回即可，不需要刷新**
4. 服务端代码要能跑在 Cloudflare Workers 一类受限运行时：**禁止 `node:fs` / `node:crypto` / `Buffer`**；加解密走 Web Crypto（`server/utils/crypto.ts`），密钥一律 `useRuntimeConfig()` 优先、环境变量兜底
5. 架构决策（2026-08-29）：**serverless 上失效不如代数**——采用版本化缓存键，删除整个失效子系统
6. 架构决策（2026-10-30）：**数据写入与版本号递增必须同一事务**；版本键缓存不做后台刷新；内存后端为有上限 LRU

## 项目概览

OneNav：Nuxt 4（Vue 3 + Nitro）导航站。

- 数据层：Drizzle ORM（`server/database/schema.ts`）+ Neon serverless 驱动，**读走 HTTP（`getDb`）、写走 WebSocket Pool（`getDbPool`）**——写必须用 Pool，因为「业务写入 + 版本递增」要包在同一事务里
- 认证：nuxt-auth-utils 密封 HttpOnly Cookie（`server/utils/session.ts`）。会话里只存 `{id, name, email, image, role}` + `tv`（tokenVersion 快照）
- 服务端缓存：版本化键 SWR（`server/utils/cache.ts` + `cache-keys.ts`），可选 Upstash Redis 跨实例共享
- 客户端数据：Pinia Colada 查询缓存（`app/utils/queryKeys.ts`）+ SSR payload，跨标签页用 BroadcastChannel 失效
- UI：Nuxt UI 4 + Tailwind CSS v4 + Lucide

## 领域词汇表

| 术语 | 含义 |
|------|------|
| **role** | 用户角色，存 DB + 会话：`admin` / `user`。角色变更按对账 TTL 生效；`tokenVersion` 用于强制下线 |
| **isSystemAdmin** | seed 出来的超级管理员标记。普通 admin 不能删除该账号，也不能把它降为 `user` |
| **scope** | 视图场景：`home`（前台首页/分类页）/ `manage`（管理后台）。查询条件与缓存键都带此维度 |
| **isPublic** | Category 的公开标志。公开分类任意登录用户可写入 |
| **isPrivate** | Link 的私有标志。私有链接仅所有者可见 |
| **isHidden** | 分类/链接的「不展示」标志（后台仍可见） |
| **anon** | 未登录用户。缓存键中 userId 归一化为 `anon` |
| **有效可见性** | 链接可见 = `!link.isPrivate && link.category.isPublic`。**私有分类下的链接一律视作私有**，即使链接本身非私有 |
| **tokenVersion (`tv`)** | 用户级下线计数器；改密/重置即 `+1`，会话快照与库中不一致 → 会话立即失效 |

## 权限分配逻辑（单一真源：`server/utils/permissions.ts`）

所有「某用户能看到/操作哪些数据」的判断统一走此模块：API where 条件、统计口径、搜索均复用。Nuxt 版的断言函数直接抛 `createError`，不再返回布尔值。

### 决策点

| 决策点 | 函数 | 规则 |
|--------|------|------|
| 分类可见 | `buildCategoryWhere(userId)` | anon→仅公开；登录（含 admin）→公开+自己的私有 |
| 链接可见 | `buildLinkWhere(scope, userId, role)` | 见下方矩阵 |
| 统计口径 | `buildStatsWhere(userId, role)` | 与链接可见性同口径 |
| 分类编辑/删除 | `assertCanManageCategory(session, category)` | admin→任意公开+自己的私有（**不能动他人私有分类**）；user→仅自己创建的 |
| 向分类加链接 | `assertCanAddLinkToCategory(session, category)` | admin→任意；user→任意公开+自己的私有 |
| 管理接口 | `adminOnly(session)` | 仅 `admin`（如 `/api/users`），否则 401/403 |
| 缓存键场景 | `cacheScope(scope)` | `home→pub` / `manage→mgmt`，键里不出现原始 scope 名 |

### 链接可见矩阵（`buildLinkWhere`）

| 场景 | anon | user | admin |
|------|------|------|-------|
| home | 公开链接 + 公开分类 | 自己全部 + 他人公开（且分类公开） | 同 user（分支已合并） |
| manage | 需登录 | **仅自己的全部**（公开+私有） | 自己全部 + 他人公开（且分类公开） |

**设计意图**：admin 在 manage 场景也**看不到他人的私有链接/分类**——隐私优先于管理便利，是有意为之，不是 bug。

### 缓存层的权限投影（`server/utils/cache-keys.ts`）

- 键结构（版本化）：`links:v3:ver{N}:user:{uid|anon}:{pub|mgmt}:{catId|all}:p{page}:{sort}`；分类 `categories:v4:...`、计数 `links:count:v3:...`、仪表盘 `dashboard:stats:v2:ver{N}:{uid}`
- 不变量：任何键必带 `ver` 段；任何写操作必须 `await incrementTableVersion(table, tx)`（版本即失效信号，无主动清除）

## 会话对账（`server/utils/session.ts` + `user-cache.ts`）

- 每次请求校验 `tokenVersion` 与 `role`，防止「改密/降权后旧会话继续可用」
- Redis 模式：`nav:user:{uid}` 存 `{tokenVersion, role}`，TTL 60s 跨实例共享；写路径（改密/改角色/删用户）主动删键，TTL 只作兜底
- 无 Redis 降级：把对账时间戳写进会话（`tvAt` / `roleAt`），tokenVersion 5min、role 30s 内免查 DB
- DB 查询异常时保留现有会话，不误杀登录态
- 密封密钥 = `NUXT_SESSION_PASSWORD`（≥32 位）。**生产 runtimeConfig 只读，无法运行期赋值**，缺配直接 500；只有开发环境允许用 `AUTH_SECRET` 派生临时密钥（重启即失效）

## 三端数据交互（CRUD 全链路）— Nuxt 重写后现状

### 读路径

```
页面 useQuery(qk.xxx(), fetch)
  → SSR：handler 内 getTableVersion 构造版本化键 → swr(内存 / Redis) → Drizzle → Neon
  → 结果序列化进 payload，客户端 hydration 直接复用 Colada 状态
  → 客户端导航：Colada 命中内存则不发请求，stale 后重取
```

### 写路径（以 `POST /api/links` 为例）

```
客户端乐观更新（Colada state）
  → API: CSRF → requireSession → 权限校验 → getDbPool().transaction { DB 写入; incrementTableVersion("Link", tx) }
  → 响应返回 → notify("Link")：本页按 entityRoots.Link 根 invalidateQueries + BroadcastChannel 广播
  → 其他标签页收到消息 → 同样按根失效，活跃查询自动重取
```

### 一致性机制分工

| 层 | 机制 | 职责 |
|----|------|------|
| 服务端缓存失效 | **版本化缓存键**（`links:v3:ver{N}:...`），无主动失效 | 写操作递增版本 → 全实例天然 miss（Vercel 多实例安全） |
| 客户端↔服务端 | Colada 查询缓存 + SSR payload | 键按实体分根（`qk.*`），失效面由 `entityRoots` 定义 |
| 客户端↔客户端 | BroadcastChannel（频道 `onenav-data`） | 写方广播表名；广播不回传发送者，故写方自己失效 |

### 关键设计约束（改动前必读）

- **版本号读取（`getTableVersion`）禁止缓存**：它是缓存键的构造依据，缓存它会拿旧键→旧数据
- **`incrementTableVersion(table, tx)` 必须与业务写入同在 `getDbPool().transaction` 内并 await**：分开执行会留下「数据已提交、版本未翻页」的读窗口；响应先返回会让客户端拿到旧版本号
- **写成功后必须 `notify(table)`**（`app/composables/useDataSync.ts`）：只改本页 Colada state 而漏掉广播，其他标签页会长期停在旧数据
- **`entityRoots`（`app/utils/queryKeys.ts`）是失效面的唯一定义处**：新增查询键时同步补进对应实体根，否则该查询不会随写操作刷新
- **写方不要指望广播通知自己**：BroadcastChannel 天然排除发送者页面，本页失效是必需项
- **重复 URL 由数据库兜底**：`uniqueIndex(Link_userId_urlKey_key)`，`urlKey = linkUrlKey(url)`（= `cleanUrl(url).toLowerCase()`，见 `server/utils/recognize-url.ts`）；应用层先查一次只为友好提示，并发下用 `isUniqueViolation` 判断（PG `23505`，Drizzle 把驱动错误包在 `cause` 链里，需逐层找）
- 删除分类前先统计他人在该分类下的链接数，>0 直接 409——外键是 `onDelete: cascade`，不拦会静默删掉他人链接
- 服务端内存缓存为 LRU（上限 200），条目默认 TTL 60s；`/api/account`、`/api/users`（admin 低频）不走版本键缓存，直查 DB
- `GET /api/cache-version` 是 Next 时代客户端版本比对的遗留接口，当前前端无调用方（Colada 失效不再需要它），待确认后删除

## 已知缺陷与历史（截至 Nuxt 重写）

1. ~~search POST 分类搜索越权~~ ✅ 改走 `buildCategoryWhere` + 只返回安全字段
2. ~~`prefixPublicUser` 失效键错位 / 服务端 SWR 失效竞态~~ ✅ 随失效子系统删除而消灭（版本键方案）
3. ~~`buildLinkWhere` home admin/user 分支冗余~~ ✅ 已合并
4. ~~广播接收端空转 / `optimisticAddToCache`、`rollbackCache` 死代码~~ ✅ 已清理
5. ~~`queries.ts` 手写复制权限 where~~ ✅ 收口到 `buildCategoryWhere` / `buildLinkWhere`
6. ~~版本号 fire-and-forget + 低效~~ ✅ await + 单条 `INSERT ... ON CONFLICT ... RETURNING`
7. ~~localStorage `nav_cache_*` 无淘汰（曾是唯一开放项）~~ ✅ 随 Nuxt 重写消灭：客户端不再做分页 localStorage 缓存，改用 Colada 内存缓存（localStorage 只剩主题 / 强调色 / 视图密度偏好）
8. ~~编辑链接后客户端 createdAt 倒序重排列表~~ ✅ `LinksGrid.sortLinks` 与服务端一致，仅置顶变化才重排
9. ~~sortOrder 分类内 / 全局双轨~~ ✅ 统一为用户内全局编号；生产数据已迁完，`scripts/migrate-sort-order.ts` 与旧 Prisma 迁移在 P6 一并删除

**仍存在的已知限制**（不是 bug）：无限滚动视图的拖拽只对「已加载项」重编号；搜索页禁拖（`LinksGrid :draggable="false"`），因为搜索结果是全量数据的子集，拖拽重编号会污染全局顺序。

**未实施的优化方向**：权限规则表驱动（身份×场景×操作矩阵数据化 + 解释器）。历史上否决过的方案：删服务端缓存（性能倒退）、把 Upstash Redis 设为必选（过度工程，保持可选）。

## 图标（favicon）获取逻辑 — 设计约定

**faviconsnap（独立项目）是唯一的图标获取引擎，只在录入时运行一次**：

```
添加/编辑链接 → LinkForm 自动识别 → POST /api/links/recognize
  → recognize-url.ts buildFaviconProxyUrl(): 无条件生成
    https://faviconsnap.com/api/favicon?url={站点根地址}&size=64
  → 存入 Link.favicon
展示时 → LinkCard 只读库渲染：faviconsnap URL 直连 <img>；
  其他来源的 favicon URL 走 GET /api/favicon 服务端代理（防盗链头 + 魔数/SVG 判定 + 失败日志）
  → onError 仅本次会话回退默认图标，不写 localStorage、无运行时解析/回退链
```

**禁止**：展示层做运行时图标解析 / 回退链 / broken 标记（曾误加 hunter.io 回退与 localStorage broken 标记，已按用户设计删除）。
已知边界：faviconsnap 对反爬极强的站点（如 wenshu.court.gov.cn）可能抓不到 → 该类链接显示默认图标属预期，可在编辑对话框手动填图标 URL 覆盖。

## 排序（sortOrder）体系 — 「用户内全局编号」

- `sortOrder` = 该用户内全局唯一、从 0 连续递增（**不是分类内编号**）
- 服务器展示排序固定：`isPinned desc → sortOrder asc → createdAt asc`（createdAt 是 tie-breaker，禁止移除）
- 新建 / 导入链接：取**用户内** `max(sortOrder)+1` 追加末尾（`server/api/links/index.post.ts`、`server/api/import-export/import.post.ts`）
- 拖拽重排（`PUT /api/links/reorder`）：按当前视图全局重编号 0..N，保持置顶分组
- 客户端排序（`app/components/LinksGrid.vue` 的 `sortLinks`）必须与服务端完全一致；**禁止用 createdAt 倒序重排客户端列表**（与 sortOrder 升序相反，曾导致编辑后列表错乱）；仅 `isPinned` 变化才重排

## 网页信息识别的编码处理

`server/utils/recognize-url.ts` 拉取 HTML 后按顺序判定字符集：BOM → `Content-Type` 的 `charset` → HTML `<meta charset>` → GBK 系（gbk / gb18030 / GB2312）显式解码 → UTF-8 兜底。下载有体积上限，超限用流式 `reader.cancel()` 截断；非 HTML 的 `Content-Type` 直接放弃解析。新增编码支持改这里，不要在调用方各写一份解码。

## 前端约定（P0–P2 阶段收口）

- **组件只用 Nuxt UI**：弹层 `UModal`、下拉 `USelectMenu`、确认框统一 `app/components/ConfirmDialog.vue`；不再出现原生 `<select>` 或手写浮层
- **图标统一 Lucide**：存库是 PascalCase 名（如 `Gamepad2`），渲染经 `app/components/DynamicIcon.vue` 转 `i-lucide-xxx`；同一实体全站同一图标
- **结果播报统一走 `useAppToast()`**（右上角、自动消失），不做行内常驻状态文字
- **状态变更接口必须经 `defineApiHandler`**（`server/utils/api.ts`）；CSRF 由 `server/middleware/csrf.ts` 全局校验 Origin/Referer 与 Host 同源
- 邮件未配置时 `GET /api/meta` 返回 `emailConfigured: false`，登录页据此隐藏「忘记密码」；自助注册的验证码接口直接 503

## 数据库变更口径

- 迁移由 drizzle-kit 管理，SQL 在 `drizzle/`（`0000_baseline.sql` = 生产库基线）
- `drizzle.config.ts` / `scripts/seed.ts` / `scripts/reset-password.ts` **默认读 `.env.development`（测试库 nav-test）**；要打生产库必须显式 `ALLOW_PROD_DB=1`
- 不使用 `db:push`。schema 改动流程：改 `server/database/schema.ts` → `pnpm db:generate` → 对测试库 `pnpm db:migrate` → 人工确认后再生产执行
- 表名 / 列名 / 索引名沿用生产库既有大小写与名称（不加 `@map`、保留历史生成名），避免迁移反复 rename
- `updatedAt` 无 DB 默认值，由应用 `$onUpdate` 写入

## 文档指针

- `README.md` — 面向使用者的功能 / 部署文档（不含实现细节）
- `server/utils/permissions.ts` — 权限规则真源
- `server/utils/cache-keys.ts` — 缓存键真源
- `server/utils/session.ts` — 会话与对账真源
- `docs/plans/2026-08-20-visibility-consistency-design.md` — 权限 / 搜索 / 缓存单一来源化改造（`search.ts`、`cache-keys.ts` 的由来）
- `docs/plans/2026-10-30-vue-nuxt-stack-decisions.md` — Nuxt 重写的选型决策记录
- `docs/superpowers/` — Next.js 时代的实现计划与设计文档（历史归档，代码路径已过时）
