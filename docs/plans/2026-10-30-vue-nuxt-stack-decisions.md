# 决策文档：Nuxt 4 重写技术栈定稿

日期：2026-10-30

分支：`vue`

状态：待确认。本文档即完整决策清单，确认后按第 9 节顺序实施。

## 0. 结论速览

| 层 | 定稿 | 版本 | 一句话理由 |
|---|---|---|---|
| 框架 | Nuxt 4 + Vue 3（Nitro） | Nuxt 4.6.3 / Vue 3.5 | SSR + 文件路由 + 同构 fetch，serverless 一等公民 |
| 语言 | TypeScript strict + vue-tsc | TS 6.0.3 / vue-tsc 3.3.14 | 边界类型 + 编译期校验 |
| 数据层 | Drizzle ORM + `@neondatabase/serverless` | 0.45 / 0.31（kit） | 无 codegen、无原生二进制、HTTP 读 + WS 事务 |
| UI | `@nuxt/ui` 4 全站 + Tailwind v4 + Reka UI | 4.12.0 | 一套设计令牌、可访问性内置、Pro 组件已并入 MIT |
| 认证 | `nuxt-auth-utils` 密封 Cookie | 0.5.34 | 去掉自签 JWT，保留 tokenVersion/角色刷新 |
| 安全 | `nuxt-security` + Upstash 限流 + Zod | 2.7.0 | 响应头/体积限制 + 跨实例限流 |
| 状态 | Pinia（仅 UI 状态） | 4.1.0 / @pinia/nuxt 1.0.3 | 不镜像服务端数据 |
| 客户端缓存 | Pinia Colada | 1.4.8 / @pinia/colada-nuxt 1.2.0 | 唯一缓存层，取代业务侧 `useAsyncData` |
| 主部署 | Vercel Node（`vercel` preset） | Node ≥ 22 | 零配置、WebSocket/CPU 无额外限制 |
| 可选部署 | Cloudflare Workers（`cloudflare_module`） | `nodejs_compat` | 一等可选项，按第 7 节约束保持可移植 |

> 决策原则：只看 **serverless 适配度 / 与项目契合度 / 美观度**，不以迁移成本作为否决理由；范围覆盖公共页与后台。

## 1. 背景与范围

`vue` 分支已把 Next.js 版本迁移到 Nuxt 4 骨架，但数据层仍是 Prisma，客户端缓存仍是 `useAsyncData`，UI 仍是自研组件 + 零散 Tailwind。本次定稿把以下四件事一次收敛：

1. 数据层切到 Drizzle + Neon（读 HTTP、写 WebSocket 事务）。
2. UI 全站切到 Nuxt UI 4，只保留少数自研交互。
3. 认证切到 `nuxt-auth-utils`，安全头交给 `nuxt-security`。
4. 客户端缓存统一到 Pinia Colada，Pinia 只存 UI 状态。

**不在本次范围**：数据库选型（继续 PostgreSQL/Neon）、核心业务规则（权限、可见性、缓存版本语义）、导入导出文件格式。

## 2. 应用框架与语言

- Nuxt 4.6.3，`app/` 目录结构，Nitro server routes。
- Vue 3.5 Composition API，`<script setup lang="ts">`。
- TypeScript 6.0.3 strict；`nuxt typecheck` 作为门禁。
- `shared/types.ts` 作为 API 契约真源：`$fetch` 不会按路径推导返回类型，所有请求显式标注泛型。
- 不引入 ESLint/Prettier（见第 11 节未决项），格式化依赖编辑器。

## 3. 数据层：Drizzle + Neon

### 3.1 选型

| 项 | 决策 |
|---|---|
| ORM | Drizzle ORM 0.45 + drizzle-kit 0.31 |
| 驱动 | `@neondatabase/serverless` |
| 读 | `neon-http`（HTTP 单语句，冷启动最低） |
| 写 | `neon-serverless` 的 WebSocket `Pool`（交互式事务） |
| Schema | `server/database/schema.ts` + `relations.ts` |
| 迁移 | `drizzle/`，`drizzle-kit generate` / `migrate` |
| 唯一冲突 | PG 错误码 `23505`（替代 `P2002`） |

选型理由：

- 无 codegen、无 Rust/原生引擎，Vercel 函数体积与冷启动显著优于 Prisma。
- Neon HTTP 驱动在 serverless 上无连接池压力；只有写路径需要 WebSocket。
- Schema 即 TS，权限条件、聚合、`ilike` 都能直接落到 SQL。

### 3.2 双驱动边界（硬规则）

- **所有读**走 `db`（`drizzle(neon(url), { schema })`）。
- **所有写**走 `dbPool`（`drizzle(new Pool({ connectionString, max: 3 }), { schema })`）。
- 原因：每条写都必须与 `incrementTableVersion` 同事务，至少两条语句；Neon HTTP 驱动不支持交互式事务。
- 运行时要 Node ≥ 22（全局 `WebSocket`）；本地已是 Node 24，Vercel 选 Node 22/24。
- 连接串使用 Neon pooled endpoint；`max: 3`、`idleTimeoutMillis: 10_000`，避免冻结实例堆积连接。

### 3.3 必须保留的数据不变量

1. **版本化缓存键**（服务端 Redis/内存缓存）：
   - `linkListKey` / `categoryKey` / `linkCountKey` / `dashboardStatsKey` 的键结构与版本段不变。
   - `getTableVersion` 直查 DB，禁止缓存（旧版本号会读到旧键）。
2. **写操作同事务递增版本**：
   - 任何 Link/Category/User 写入，必须 `await incrementTableVersion(table, tx)`，`tx` 即 `dbPool.transaction` 的回调参数。
   - 联动规则保留：Category/User 变更同时递增 Link；Link/Category/User 变更同时递增 DashboardStats。
   - 版本 upsert 继续用原生 SQL（`INSERT ... ON CONFLICT DO UPDATE ... RETURNING`），不由 ORM 拼装。
3. **URL 唯一约束**：`Link_userId_urlKey_key`（`userId + urlKey`），`urlKey = cleanUrl(url).toLowerCase()`；并发查重只认数据库约束，应用层 `findFirst` 只作友好提示。
4. **分类删除保护**：事务内 `SELECT ... FOR UPDATE` 锁分类行，存在外键链接时返回 `409 CATEGORY_HAS_FOREIGN_LINKS`。
5. **权限可见性单一真源**：`buildCategoryWhere` / `buildLinkWhere` / `buildStatsWhere` 改为返回 Drizzle `SQL` 条件，所有查询复用，禁止在路由里手写可见性。
6. **tokenVersion 失效**：改密/重置/强制下线递增 `User.tokenVersion`。

### 3.4 Schema 映射注意点

- **表名/列名与线上完全一致**：Prisma 未使用 `@map`，因此表名 `"Link"`/`"Category"`、列名 `"userId"` 等均带大小写，Drizzle 必须原样声明。
- **时间列类型**：Prisma 默认 `timestamp(3)`（无时区），Drizzle 用 `timestamp('createdAt', { precision: 3, mode: 'date' })`，不要加 `withTimezone`，否则 introspect 会漂移。
- **索引/外键名沿用 Prisma 生成名**：`Link_userId_urlKey_key`、`Link_userId_idx`、`Link_categoryId_fkey` 等显式命名，避免未来迁移反复 rename。
- **主键**：新记录用 `crypto.randomUUID()`（Web Crypto，两个运行时都可用）；存量 cuid 继续有效，不做回填。
- **`updatedAt`**：Drizzle `$onUpdate(() => new Date())`，写路径必须触发 update。
- **关系查询**：`Link.category`、`Category.children` 用 `relations` + `db.query`；`_count.links` 改为 `count()` 聚合子查询，禁止 N+1。
- **搜索**：Prisma `contains + mode: insensitive` → `ilike`；打分排序仍在应用层。

### 3.5 迁移与线上基线

现有 Prisma 迁移已包含 `20261030000000_baseline` 与 `20261030000100_link_url_key`（新增 `urlKey`、回填、唯一索引）。切 Drizzle 时**不重放建表 SQL**，而是建立 Drizzle 基线：

1. 等 Neon 额度重置（2026-11-01 08:00 北京时间）后执行，避免再次触发额度事故。
2. 先确认线上实际结构：`prisma migrate status` / 只读 introspect，确认 `urlKey` 列与唯一索引已存在；若未应用，先用 Prisma 把这批迁移补完，再切 Drizzle。
3. 从 `schema.ts` 生成 `drizzle/0000_baseline.sql`；用 `drizzle-kit pull` 到临时目录，与 `schema.ts` 做 diff，要求零漂移（表、列类型、索引名、外键名）。
4. 在 Neon branch（prod 的 copy-on-write 分支）上演练：写入基线记录 → `drizzle-kit migrate` 应为 no-op → 后续迁移可正常追加。
5. 对 prod 写入基线记录（`drizzle.__drizzle_migrations` 的 `hash` = 基线 SQL 的 sha256，`created_at` = journal 的 `when`），再跑 `drizzle-kit migrate` 校验 no-op。
6. 切代码、部署；确认稳定后再删除 Prisma 依赖与 `prisma/`（保留一个版本周期）。
7. **禁止**对 prod 使用 `drizzle-kit push`。

> 若线上尚未包含 `urlKey`，先按 Prisma 迁移补齐并验证回填结果，再做 Drizzle 基线；基线必须描述线上真实结构，而不是目标结构。

## 4. UI 层：Nuxt UI 4 全站

### 4.1 选型与底座

| 项 | 决策 |
|---|---|
| 组件库 | `@nuxt/ui` 4.12.0（MIT，Pro 组件已并入） |
| 样式 | Tailwind CSS v4，`@import "tailwindcss"; @import "@nuxt/ui";` |
| 无头层 | Reka UI（Nuxt UI 内部依赖，不直接用） |
| 主题 | `@nuxtjs/color-mode`，`storageKey: 'theme'`、`classSuffix: ''` |
| 图标 | `@nuxt/icon` + 本地 `@iconify-json/lucide`，`serverBundle` 打包，禁止运行时请求 Iconify API |
| 应用壳 | `app.vue` 用 `<UApp>` 包裹（toast/tooltip/overlay 的 Provider） |
| 颜色 | `app.config.ts`：`ui.colors.primary = 'blue'`、`neutral = 'slate'`，品牌色仍走 CSS 变量 |

`nuxt.config.ts` 移除 `@tailwindcss/vite` 手动插件与 `tw-animate-css`，由 Nuxt UI 模块接管 Tailwind 配置。

### 4.2 组件映射

| 现有交互 | Nuxt UI 组件 |
|---|---|
| 全局搜索面板 | `UCommandPalette`（分组 + 键盘导航） |
| 侧边导航/分类树 | `UNavigationMenu`（vertical）+ 自研递归项样式 |
| 头像菜单 | `UDropdownMenu` |
| 登录/编辑/确认弹窗 | `UModal`（`UForm` + Zod schema） |
| 右键菜单 | `UContextMenu` |
| 二维码 | `UModal` + 保留现有 `qrcode.vue` 排版 |
| 后台表格 | `UTable` + `UPagination` + `USelect` + `UInput` |
| 后台表单 | `UForm` + `UFormField`（Zod 校验，替代手写错误态） |
| 无遮罩浮层（作品信息/作者卡等） | `USlideover` + `:modal="false"`，保持侧栏可点 |
| 结果提示 | `useToast()`，右上角，4s 自动消失 |
| 骨架屏 | `USkeleton` |
| 空状态 | `UEmpty`（或保留现有插画/图标组合） |
| 主题切换 | `UColorModeButton` / `UColorModeSelect` |
| 开关/标签/徽标 | `USwitch` / `UBadge` / `UChip` |

### 4.3 保留自研的部分

- `LinkCard` 的视觉外观与悬浮动效（Nuxt UI 无等价卡片）。
- 拖拽网格：继续 `vue-draggable-plus`，只把外层容器/工具条换成 Nuxt UI。
- 头像光环、首页品牌水印、二维码版式。
- 权限/可见性徽标的业务语义样式（用 `UBadge` 承载，颜色映射自研）。

### 4.4 移除清单

`vue-sonner`、`UiDialog`、`ConfirmDialog`、`useTheme`、`ThemeSwitcher`、`DynamicIcon`、`lucide-vue-next`、`clsx`、`tailwind-merge` 全部移除，能力由 Nuxt UI / `useToast` / `useColorMode` / `UIcon` / `tv()` 承接。

### 4.5 交互与视觉约束（沿用已确认偏好）

- 不用进度条/环形图表达指标，数值直接跟在状态标签后。
- 全站只有一个「可配置字号档」（设置 → 外观，默认 13），层级只靠字重与色彩。
- 同一实体全站同一图标，优先品牌图标。
- Tooltip 仅三种场景：截断文字、无文字图标、设置项说明；说明带动作的改弹窗。
- 浮层不压侧栏、不加遮罩；叠层一次点击只关一层。
- 去除营销式副标题、重复 placeholder 与菜单里重复列表值的行。
- 状态色（选中/hover/高亮）必须压过蓝灰玻璃底；`::selection` 用饱和 primary。

### 4.6 主题 5 天过期

`@nuxtjs/color-mode` 无过期能力。方案：`plugins/theme-expiry.client.ts` 读取 `theme-expiry`，过期则把偏好重置为 `system`；用户显式切换时续期。**是否保留该规则见第 11 节**，若不保留则删插件与 `theme-expiry` 键。

## 5. 认证与安全

### 5.1 认证

| 项 | 决策 |
|---|---|
| 会话 | `nuxt-auth-utils` 密封 Cookie（HttpOnly、SameSite=Lax、prod Secure、30 天） |
| 密钥 | `NUXT_SESSION_PASSWORD`（≥32 字符），缺失即启动失败 |
| 服务端读取 | `getUserSession(event)` / `requireUserSession(event)` |
| 客户端读取 | `useUserSession()`（`loggedIn` / `user` / `fetch` / `clear`） |
| 登录写入 | `setUserSession(event, { user: { id, role, tokenVersion } })` |
| 会话校验 | 保留 tokenVersion + 角色刷新 + Redis 鉴权缓存（60s）+ DB 故障保留会话 |
| 密码 | `bcryptjs`（存量 `$2a/$2b` 哈希兼容），成本 10 |
| 邮件 | Resend REST（fetch），验证码 + 60s 重发限制 |
| 找回密码 | HMAC 一次性令牌（Web Crypto）+ DB nonce 消费 |
| OAuth | 表结构保留，登录入口暂不恢复（未决项） |

`server/utils/session.ts` 保留现有调用签名，内部改为 `nuxt-auth-utils` + 校验逻辑，减少路由改动。

### 5.2 安全

- **响应头**：`nuxt-security` 2.7.0。CSP 首期 `reportOnly`，收集一周后再收紧；HSTS、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy` 直接启用。
- **CSRF**：不引入双提交 token（会要求改造所有客户端请求）。用 `server/middleware/csrf.ts` 对非 GET/HEAD 请求校验 `Origin`/`Referer` 与请求 Host 同源，跨源直接 403。
- **请求体大小**：`nuxt-security` 限制默认 2MB；导入接口单独放宽到 10MB。
- **限流**：继续 Upstash REST（跨实例）；`nuxt-security` 自带的内存限流不用于生产。沿用现有登录、验证码、搜索、导入的阈值。
- **输入校验**：Zod 在 API 边界解析 body/query；失败统一 400。
- **SSRF**：favicon 探测与 URL 识别保留现有防护：仅 http/https、解析 DNS 后拒绝私网/环回/链路本地、限制重定向次数、超时与响应体上限。
- **随机数/哈希**：统一 Web Crypto（`crypto.getRandomValues`、`crypto.subtle`），不依赖 `node:crypto`，保证 Workers 可移植。
- **审计日志**：登录失败、改密、管理员操作保留现有记录。

## 6. 状态管理：Pinia + Pinia Colada

### 6.1 边界

| 类型 | 归属 |
|---|---|
| 服务端数据（链接、分类、统计、用户列表、搜索结果） | **只**放 Colada query cache |
| 跨路由 UI 状态（侧栏折叠、命令面板开关、批量选择） | Pinia |
| 主题 | `@nuxtjs/color-mode` |
| 当前登录用户 | `useUserSession()` |
| 表单草稿/局部开关 | 组件本地 `ref` |

硬规则：

- Pinia **禁止**镜像服务端数据，**禁止**与 Colada 双缓存。
- 业务数据预期 `useAsyncData` 使用数为 0；仅保留 Nuxt 内部/页面元信息用途。

### 6.2 Query key 约定

语义化、层级化、**不含服务端版本号**（版本号是服务端缓存内部实现）：

| 场景 | Key |
|---|---|
| 导航分类树 | `['nav']` |
| 首页链接 | `['links', 'home', sort]` |
| 分类页 | 复用 `['links', 'home', sort]`，按 `categoryId` 客户端过滤（与现状一致） |
| 搜索 | `['search', q]`（`enabled: () => !!q`） |
| 后台链接 | `['admin', 'links', { page, pageSize, sort, q, categoryId }]` |
| 后台分类 | `['admin', 'categories']` |
| 后台统计 | `['dashboard', 'stats']` |
| 后台用户 | `['admin', 'users', { q, page }]` |
| 后台设置 | `['admin', 'settings']` |

默认 `staleTime: 30_000`、`retry: 1`；后台列表 `staleTime: 0`（切页即取新）。

### 6.3 `useAsyncData` 替换映射

| 现状 | 目标 |
|---|---|
| `useAsyncData('nav', …)` | `useQuery({ key: ['nav'], query: () => requestFetch('/api/nav') })` |
| `useAsyncData('links-home', …)` | `useQuery({ key: () => ['links','home',sort.value], query: … })` |
| `useAsyncData('search-results', …, { watch: [query] })` | `useQuery({ key: () => ['search', query.value], enabled: () => !!query.value, … })` |
| `useAsyncData('dashboard-stats', …)` | `useQuery({ key: ['dashboard','stats'], … })` |
| `refreshNuxtData(key)` | `queryCache.invalidateQueries({ key })` |

query 函数内必须用 `useRequestFetch()` 携带 Cookie：

```ts
const requestFetch = useRequestFetch()
const { data, status } = useQuery({
  key: () => ['links', 'home', sort.value],
  query: () => requestFetch<LinkDto[]>('/api/links', { query: { page: 1, pageSize: 1000, sort: sort.value } }),
  staleTime: 30_000,
})
```

SSR 由 `@pinia/colada-nuxt` 负责脱水/水合；首屏不闪空态。

### 6.4 变更失效

| 写操作 | 失效前缀 |
|---|---|
| Link 增删改/置顶/排序 | `['links']`、`['nav']`、`['dashboard']`、`['admin']` |
| Category 增删改 | `['nav']`、`['links']`、`['dashboard']`、`['admin']` |
| 用户资料/密码 | `['dashboard']` + `useUserSession().fetch()` |
| 导入 | 以上全部 |
| 设置 | `['admin','settings']`、`['nav']` |

`invalidateQueries` 默认前缀匹配，不写逐条 key。

### 6.5 跨标签同步

- 只保留**一个**客户端订阅：`plugins/data-sync.client.ts`，频道 `onenav-data`。
- 消息体用表名 `Link | Category | User`（与现状一致），收到后按 6.4 前缀失效。
- 写操作成功后：本标签先本地失效，再 `postMessage`（BroadcastChannel 不回送发送者）。
- 删除 `useDataSync` 的 `onMounted` 订阅与 `refreshNuxtData` 调用。

### 6.6 乐观更新

仅用于高频、低风险操作：置顶、拖拽排序、批量删除。

```ts
const cache = useQueryCache()
const { mutate } = useMutation({
  mutation: (id: string) => $fetch(`/api/links/${id}/pin`, { method: 'POST' }),
  onMutate: (id) => {
    const prev = cache.getQueryData(['links', 'home'])
    cache.setQueryData(['links', 'home'], (old) => /* 切换 isPinned */)
    return { prev }
  },
  onError: (_e, _v, ctx) => cache.setQueryData(['links', 'home'], ctx!.prev),
  onSettled: () => {
    cache.invalidateQueries({ key: ['links'] })
    notify('Link')
  },
})
```

### 6.7 服务端缓存与客户端缓存是两层

| | 服务端缓存 | 客户端缓存 |
|---|---|---|
| 存储 | Redis / 进程内 LRU | 浏览器内存（Colada） |
| 键 | 版本化（`links:v3:ver{N}:…`） | 语义化（`['links','home']`） |
| 失效 | 写事务内递增版本，旧键自然淘汰 | 变更后前缀失效 |
| 目的 | 跨用户/跨实例降 DB 压力 | 已打开页面不重复请求 |

两者不共享键、不共享版本号，避免「版本号进 query key 导致缓存碎片」。

## 7. 部署：Vercel 主 + Cloudflare 一等可选

### 7.1 双目标矩阵

| 维度 | Vercel（默认） | Cloudflare Workers |
|---|---|---|
| Nitro preset | `vercel` | `cloudflare_module` |
| 运行时 | Node 22/24 | workerd + `nodejs_compat` |
| 构建 | `nuxt build` | `NITRO_PRESET=cloudflare_module nuxt build` |
| DB 读 | neon-http | neon-http |
| DB 写 | WebSocket Pool（全局 WebSocket） | WebSocket Pool（Workers 原生 WebSocket） |
| 会话 Cookie | 密封 Cookie | 同左 |
| 密码哈希 | bcryptjs | bcryptjs（Paid）或 PBKDF2（Web Crypto） |
| 邮件/LLM | fetch REST | fetch REST |
| 限流 | Upstash REST | Upstash REST |
| 定时/后台任务 | Vercel Cron（如需） | Cron Triggers（如需） |
| 包体积 | 无硬限制 | 免费 3MiB / Paid 10MiB（gzip） |
| CPU | 无额外限制 | 免费 10ms/请求，Paid 30s |

**能力矩阵（重要）**：Workers 免费版 10ms CPU 无法稳定完成 bcrypt/PBKDF2 登录。因此：

- 匿名浏览、搜索、分类页：Workers 可用。
- 登录/注册/改密：Workers Paid 可用；免费版不保证，生产建议仍走 Vercel。
- 若必须免费版全功能：登录降级到 Vercel（跨域 Cookie 不可行）→ 不推荐，视为不支持。

### 7.2 可移植性约束（编码期硬规则）

1. 禁止 `node:fs`、`node:child_process`、`node:crypto`、`node:stream`；用 Web Crypto / Web Streams。
2. 禁止 Buffer 作为二进制载体；favicon/图片处理统一 `Uint8Array`。
3. 数据库只用 `@neondatabase/serverless`；禁止 `pg` / `postgres.js` / 原生 TCP。
4. 限流、缓存只用 Upstash REST；禁止依赖进程内状态做正确性保证（LRU 只作降级）。
5. 邮件/LLM 用 `$fetch` 调 REST；移除 `resend`、`openai` SDK。
6. 环境变量只经 `useRuntimeConfig()`，不在模块顶层读 `process.env`（Nitro 构建期/运行期差异）。
7. 密码抽象为 `hashPassword` / `verifyPassword`，运行时选择实现：
   - Node：bcryptjs（成本 10）。
   - Workers Paid：bcryptjs；Workers 免费：PBKDF2-SHA256（Web Crypto）。
   - 登录成功时按当前实现渐进重哈希。
8. 无原生依赖 → 删除 `nitro.externals`，两个预设都直接打包。

### 7.3 配置与脚本

`nuxt.config.ts`：

```ts
nitro: {
  preset: process.env.NITRO_PRESET, // 未设置时由 Vercel 自动识别
},
```

`package.json` 脚本：

```json
{
  "dev": "nuxt dev",
  "build": "nuxt build",
  "build:cf": "NITRO_PRESET=cloudflare_module nuxt build",
  "preview:cf": "wrangler dev",
  "deploy:cf": "pnpm build:cf && wrangler deploy",
  "typecheck": "nuxt typecheck",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:check": "drizzle-kit check",
  "db:studio": "drizzle-kit studio"
}
```

`wrangler.jsonc` 关键项：

```jsonc
{
  "name": "onenav",
  "main": "./.output/server/index.mjs",
  "compatibility_date": "2026-10-30",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "binding": "ASSETS", "directory": "./.output/public" },
  "observability": { "enabled": true }
}
```

- 密钥：`wrangler secret put DATABASE_URL / NUXT_SESSION_PASSWORD / UPSTASH_* / RESEND_* / OPENAI_*`。
- Vercel：环境变量在同一面板配置；`vercel.json` 只保留 `installCommand`，不配置 `functions`。
- 移除 `postinstall` 里的 `prisma generate`，改为 `nuxt prepare`。

### 7.4 CI（GitHub Actions）

门禁顺序：

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm build`（Vercel preset）
4. `pnpm build:cf`（Cloudflare preset）
5. Workers 体积检查：`wrangler deploy --dry-run --outdir=.wrangler-dry`，gzip 后 ≤ 3MiB；超出则失败并给出体积明细。
6. 可选：`wrangler dev` 冒烟（匿名首页 200、`/api/nav` 200）。

## 8. 依赖变更清单

### 移除

| 包 | 原因 |
|---|---|
| `@prisma/client` / `@prisma/adapter-pg` / `prisma` | 切 Drizzle |
| `pg` / `@types/pg` | Neon serverless 驱动 |
| `jose` | `nuxt-auth-utils` |
| `axios` | `$fetch`/ofetch |
| `vue-sonner` | `useToast()` |
| `lucide-vue-next` | `@nuxt/icon` + 本地 lucide |
| `clsx` / `tailwind-merge` | `tv()`（Nuxt UI 依赖 `tailwind-variants`） |
| `resend` / `openai` | 直接 fetch REST，减包体、保可移植 |
| `@tailwindcss/vite` / `tw-animate-css` | Nuxt UI 接管 Tailwind v4 |
| `@types/bcryptjs` | bcryptjs 3 自带类型 |

### 新增

| 包 | 版本 | 用途 |
|---|---|---|
| `drizzle-orm` | ^0.45 | ORM |
| `drizzle-kit` | ^0.31 | 迁移（dev） |
| `@neondatabase/serverless` | ^1 | HTTP/WS 驱动 |
| `@nuxt/ui` | ^4.12.0 | UI |
| `@nuxtjs/color-mode` | ^3 | 主题（Nuxt UI 依赖，显式安装便于配置） |
| `@nuxt/icon` | ^2 | 图标 |
| `@iconify-json/lucide` | latest | 本地图标集 |
| `nuxt-auth-utils` | ^0.5.34 | 认证 |
| `nuxt-security` | ^2.7.0 | 安全头 |
| `pinia` | ^4.1.0 | UI 状态 |
| `@pinia/nuxt` | ^1.0.3 | Nuxt 集成 |
| `@pinia/colada` | ^1.4.8 | 客户端缓存 |
| `@pinia/colada-nuxt` | ^1.2.0 | SSR 脱水/水合 |

### 保留

`nuxt`、`vue`、`vue-router`、`zod`、`@upstash/redis`、`bcryptjs`（升 3.x）、`qrcode.vue`、`vue-draggable-plus`、`typescript`、`vue-tsc`、`@types/node`、`tailwindcss`。

## 9. 实施顺序

| 阶段 | 内容 | 依赖 | 估算 |
|---|---|---|---|
| P0 | 依赖替换 + `nuxt.config` + `app.config.ts` + `main.css` 令牌 + `UApp` 壳 | — | 0.5d |
| P1 | Drizzle schema/relations/db/事务 + 迁移基线（branch 演练） | P0 | 1–1.5d |
| P2 | 服务端路由 Prisma → Drizzle + 权限条件 + 缓存版本事务 | P1 | 1–1.5d |
| P3 | 认证切 `nuxt-auth-utils` + `nuxt-security` + CSRF/限流/SSRF 复核 | P2 | 1d |
| P4 | 公共页重建（首页/分类/搜索/登录/重置） | P3、P0 | 1–1.5d |
| P5 | 后台重建（链接/分类/统计/导入导出/用户/设置） | P4 | 1.5–2d |
| P6 | 清理（Prisma/sonner/lucide/axios 残留）+ 双预设构建 + 冒烟 | P5 | 0.5–1d |

关键路径：P1 必须先于 P2；P4 可与 P3 并行，但为了单人执行按顺序推进。

## 10. 验收标准

1. `pnpm typecheck` 0 error。
2. `pnpm build` 成功；`pnpm build:cf` 成功；Workers gzip 体积 ≤ 3MiB（若超出，记录明细并在该阶段决定裁减或接受 Paid）。
3. 依赖与 import 中不再出现 `@prisma/*`、`pg`、`jose`、`axios`、`vue-sonner`、`lucide-vue-next`、`resend`、`openai`。
4. `app/` 下业务数据 `useAsyncData` 使用数为 0。
5. 公共页（匿名/登录）与后台 CRUD 全链路可用：链接增删改、置顶、拖拽排序、分类增删改、搜索、导入导出。
6. 缓存不变量有验证：写后立即读命中新版本；并发写入无「数据已提交、版本未递增」。
7. 认证：登录/登出/注册/找回密码；改密后旧会话失效；DB 故障时会话不被误清。
8. 安全：跨源 POST 返回 403；CSP 报告无高危违规；限流阈值触发正确。
9. 分类删除保护返回 409；URL 重复返回可读冲突提示（`23505` 映射）。
10. 匿名可见性、私有/隐藏、管理员视角与旧版一致。
11. Workers 冒烟：匿名首页与 `/api/nav` 200；登录能力按 7.1 能力矩阵记录实测结论。
12. 上线前完成 Neon 基线演练与 prod 基线；`drizzle-kit migrate` no-op。

## 11. 未决项（需确认）

1. **主题 5 天过期**是否保留？保留则加 expiry 插件；不保留则回退为 color-mode 标准持久化。
2. 后台 **users / settings / import-export** 页面是否全部实现？服务端 API 已具备，页面工作量约 1d。
3. 是否引入 **ESLint/Prettier**（当前无 lint 门禁）。
4. 是否恢复 **GitHub OAuth**（`Account` 表保留，入口暂不做）。
5. **视觉重做幅度**：公共页允许重做，是否更换主色/首页布局/卡片密度，需给参考图或明确保持现状。
6. **Cloudflare 免费版 vs Paid**：若坚持免费版，登录能力按 7.1 降级；建议 Paid（$5/月）以获得完整功能。
7. **旧表清理**：`Session`（nuxt-auth-utils 不再使用）是否删除；`VerificationToken` 是否继续作为重置 nonce 载体。建议先保留，稳定后再删。
8. 后台统计是否需要新的聚合指标（当前沿用 `dashboardStatsKey` 的字段）。

## 12. 未采纳方案与理由

| 方案 | 否决理由 |
|---|---|
| Prisma 6（现状） | Rust-free 仍保留 codegen 与较重客户端；每次 schema 变更要 generate |
| Prisma 7 | 仍需 codegen，serverless 冷启动与包体不及 Drizzle |
| Prisma 8 | 仍处 RC，不用于生产 |
| Naive UI | CSS-in-JS 运行时注入 + JS 主题对象，与 Tailwind v4 形成双样式体系；SSR 样式与水合成本更高 |
| shadcn-vue | 复制式组件，无升级通道；与 Nuxt UI 的令牌/可访问性能力重叠 |
| TanStack Query | 能力足够，但不是 Nuxt 原生；SSR 脱水与 `useRequestFetch` 需自行接线 |
| SWRV / Apollo / URQL | 前者能力不足，后两者面向 GraphQL，项目是 REST |
| Better Auth | 能力更全，但会引入第二套用户/会话模型；当前需求 `nuxt-auth-utils` 足够 |
| `useAsyncData` 作为业务缓存 | 无统一失效/乐观更新/跨标签语义，页面间共享靠 key 约定，易碎片化 |
| Vercel Edge 作为主目标 | Neon WebSocket 事务、bcrypt CPU、包体限制都更紧张；Node 更稳 |
| Cloudflare 作为唯一目标 | 免费版 CPU 限制导致登录不可用，作为一等可选项而非唯一目标 |
| `pg` / `postgres.js` | 需要 TCP，Neon serverless 环境不可用或需额外代理 |
