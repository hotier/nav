# OneNav

基于 Nuxt 4 的书签导航管理系统。

## 功能

- 书签管理（增删改查、拖拽排序、置顶、私有/隐藏）
- 分类管理（二级分类、自定义图标、公开/私有/隐藏）
- 网页信息自动识别（标题、描述、图标，自动处理 GBK / GB18030 等中文编码）
- 全站搜索 + 命令面板（`Ctrl / ⌘ + K`）
- AI 智能搜索（支持 OpenAI 兼容 API）
- 书签导入/导出（HTML / JSON）
- 账号体系：用户名密码登录、邮箱验证码自助注册、忘记密码自助重置
- 多主题切换（浅色 / 深色 / 系统）+ 主题色自定义
- 响应式设计
- 服务端图片代理（图标、头像不走客户端直连外部）
- 分级权限（系统管理员 / 管理员 / 普通用户）
- 安全基线：会话 Cookie 服务端密封、CSRF Origin/Host 校验、认证接口限流、CSP

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Nuxt 4（Nitro / h3 服务端） |
| 语言 | TypeScript |
| 数据库 | PostgreSQL（Drizzle ORM + Neon serverless 驱动） |
| 认证 | nuxt-auth-utils（密封 Cookie 会话） |
| 样式 | Tailwind CSS v4 + Nuxt UI 4（Lucide Icons） |
| 客户端数据 | Pinia + Pinia Colada |
| 包管理 | pnpm 12 |
| 缓存/限流 | Upstash Redis（可选，多实例部署推荐） |

数据库读写分两条通道：查询走 Neon HTTP 驱动（无连接池压力），写入走 WebSocket `Pool`，因为「写数据 + 递增缓存版本」必须在同一个事务里。

服务端代码不依赖 `node:fs` / `node:crypto` / `Buffer`，密钥统一从 `useRuntimeConfig()` 读取（回落到环境变量），因此可直接跑在 Cloudflare Workers 等受限运行时。

## 前置要求

- **Node.js** ≥ 22 LTS（Nuxt 4 要求；`db:seed` / `db:reset-password` 用 Node 原生 TypeScript 运行）
- **pnpm** ≥ 12（`npm install -g pnpm`）
- **PostgreSQL** 数据库：Neon、本地实例或 Docker 容器均可，需部署环境可达

## 环境变量

```bash
cp .env.example .env
```

| 变量 | 必填 | 说明 |
|------|:--:|------|
| `DATABASE_URL` | ✅ | PostgreSQL 连接串，格式见下方 |
| `NUXT_SESSION_PASSWORD` | ✅ | 会话 Cookie 密封密钥，**32 位以上**随机串。生产环境必填 |
| `AUTH_SECRET` | | 邮箱验证码 HMAC 密钥，**留空即可**，seed 自动生成并持久化到数据库 |
| `ADMIN_USERNAME` | | 管理员用户名，默认 `admin` |
| `ADMIN_PASSWORD` | | 管理员初始密码（原始值，seed 自动 bcrypt 加密）。留空则自动生成 8 位随机密码 |
| `ADMIN_EMAIL` | | 管理员邮箱，默认 `admin@example.com` |
| `OPENAI_API_KEY` | | OpenAI API Key（可选，AI 搜索需要） |
| `OPENAI_BASE_URL` | | OpenAI 兼容 API 地址，默认 `https://api.openai.com/v1` |
| `UPSTASH_REDIS_REST_URL` | | Upstash Redis REST Endpoint（可选，多实例/Serverless 推荐） |
| `UPSTASH_REDIS_REST_TOKEN` | | Upstash Redis REST Token（可选，需要写权限） |
| `RESEND_API_KEY` | | Resend API Key（可选，自助注册与找回密码需要） |
| `RESEND_FROM` | | 发件地址，如 `OneNav <noreply@your-domain.com>` |

Nuxt 会按 `NUXT_*` 规则自动把环境变量注入 `runtimeConfig`（例如 `NUXT_DATABASE_URL`、`NUXT_OPENAI_API_KEY`）；本项目同时保留了 `DATABASE_URL` / `OPENAI_API_KEY` 等原始变量名的回落读取，直接填表里这些名字即可。

**DATABASE_URL 格式：**

```
postgresql://用户名:密码@主机:端口/数据库名
```

> Neon 请使用**直连端点**（而非 pooled 端点）：写入依赖 WebSocket 事务，PgBouncer 会拦截。
> `postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require`

**密钥说明：**

- `NUXT_SESSION_PASSWORD`：会话密钥在**构建/启动时**读一次（生产 runtimeConfig 只读，无法运行期生成）。未配置时开发环境会用 `AUTH_SECRET` 派生一个临时密钥并打警告，重启即失效；生产环境则直接报错，不会静默降级。
- `AUTH_SECRET`：优先级 环境变量 → 数据库 `AppSetting` 表 → seed 首次生成并写回数据库。不写入 `.env`、不写进源码，因此多次部署/多实例不会密钥漂移。
- 生成随机密钥：`openssl rand -base64 32`

## 可选增强配置

### Upstash Redis（多实例 / Serverless 部署推荐）

单实例下，数据缓存与认证限流计数使用进程内内存实现。多实例部署（多副本容器、多个 serverless 函数）时各实例缓存彼此独立，推荐启用 Redis 共享：

- 在 https://console.upstash.com 创建数据库（选择 Global 或 Serverless、REST 协议）
- `UPSTASH_REDIS_REST_URL`：数据库详情页 REST API 的 Endpoint
- `UPSTASH_REDIS_REST_TOKEN`：同页的 Token（需要写权限，勿选 Read only）

不配置则自动降级为单实例内存实现，功能不受影响。

### Resend 邮件（自助注册 / 找回密码验证码）

**邮件服务只影响「用户自助注册」和「用户自助找回密码」**，不影响管理员重置密码：

- 配置了 Resend：注册页收邮箱验证码；登录页点「忘记密码？」→ 邮箱收验证码 → 自助重置。
- 未配置 Resend：注册与自助找回会提示"请联系管理员"，此时仍可通过以下两种方式重置密码：
  1. **管理员后台**：登录后台 → 用户管理 → 目标用户「重置密码」按钮，直接设置新密码（不依赖邮件）。
  2. **运维脚本**：`pnpm db:reset-password`（见「运维」章节）。

配置步骤：

- 在 https://resend.com 注册并添加发信域名，按提示配置 SPF / DKIM 的 DNS 记录
- 创建 API Key（Sending access，`re_` 开头）填入 `RESEND_API_KEY`
- `RESEND_FROM` 使用已验证的发送地址，例如 `OneNav <noreply@your-domain.com>`

## 快速开始（本地开发）

```bash
# 1. 安装依赖（postinstall 会自动 nuxt prepare）
pnpm install

# 2. 配置数据库连接
cp .env.example .env
# 本地建议再建一个 .env.development，把 DATABASE_URL 指向测试库
# dev 模式下 Nuxt 会优先读 .env.development，迁移与 seed 也默认只连它

# 3. 建表 + 初始化（创建管理员账号）
pnpm db:migrate
pnpm db:seed

# 4. 启动开发服务器
pnpm dev
```

打开 http://localhost:3000，使用 seed 日志中打印的管理员账号登录。

## 数据库变更

迁移由 drizzle-kit 管理，SQL 文件在 `drizzle/` 下（`0000_baseline.sql` 为基线）。

```bash
# 改完 server/database/schema.ts 后生成迁移
pnpm db:generate

# 应用迁移（默认连 .env.development 里的测试库）
pnpm db:migrate

# 对生产库执行：必须显式声明，否则 drizzle.config.ts 仍会使用 .env.development
ALLOW_PROD_DB=1 DATABASE_URL="postgresql://..." pnpm db:migrate
```

> `drizzle.config.ts` 默认优先读 `.env.development`，就是为了让"顺手一条 migrate"打不到生产库。项目不使用 `db:push`，schema 变更一律走迁移文件。

## 部署

### 方式一：Vercel

1. 导入仓库到 Vercel
2. Environment Variables 至少填写 `DATABASE_URL` 与 `NUXT_SESSION_PASSWORD`
3. 构建命令默认 `nuxt build`（Nuxt 官方 Vercel 预设）

注意：

- **构建期不碰数据库**：构建只做类型检查与打包，不会自动迁移、不会自动 seed，避免一次部署改掉生产 schema 或管理员密码。
- 首次部署前，在任意能连到生产库的机器上执行一次 `ALLOW_PROD_DB=1 DATABASE_URL=... pnpm db:migrate`，再执行 `DATABASE_URL=... pnpm db:seed` 建管理员。
- 生产环境建议同时配置 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`（多实例共享缓存与限流）与 `RESEND_API_KEY` / `RESEND_FROM`（注册与找回密码）。

### 方式二：自有服务器

```bash
# 1. 克隆代码并安装依赖
git clone <repo-url> && cd nav
pnpm install

# 2. 配置 .env（DATABASE_URL + NUXT_SESSION_PASSWORD）
cp .env.example .env

# 3. 建表 + 初始化 + 构建
pnpm db:migrate   # 若 .env.development 存在，改用 ALLOW_PROD_DB=1
pnpm db:seed
pnpm build
```

**启动与守护：**

```bash
pnpm start   # 等价于 node .output/server/index.mjs，默认监听 3000
PORT=3100 pnpm start   # 换端口
```

生产环境建议使用进程守护（二选一）：

```bash
# pm2
pm2 start "pnpm start" --name onenav

# systemd（示例）
# ExecStart=/usr/bin/pnpm start
# WorkingDirectory=/opt/nav
```

**反向代理：** 使用 Nginx / Caddy 将域名转发到 `http://127.0.0.1:3000` 并启用 HTTPS。页面、API、图片代理均走同一域名，无需额外配置。会话 Cookie 在非 production 环境下 `secure=false`，本地用 HTTP 直接访问即可。

**多实例部署：** 多副本运行（Docker Compose 多副本、K8s 多 Pod）务必配置 Upstash Redis，否则缓存与限流按实例独立。

**再次部署：** `pnpm build && pnpm start` 只做构建，幂等且不触碰数据库。schema 变更用 `pnpm db:migrate` 单独推进。

### 首次部署日志示例

```
🔗 目标库: ep-xxx.region.aws.neon.tech
🌱 开始初始化数据库...
🔑 AUTH_SECRET: 已生成并写入数据库
🔐 管理员密码: 自动生成

┌───────────────────────────────────────────────┐
│  管理员账号                                   │
├───────────────────────────────────────────────┤
│  用户名: admin                                │
│  密  码: Kx9mP2nQ                             │
│  邮  箱: admin@example.com                   │
│  来源:   自动生成                             │
└───────────────────────────────────────────────┘

🎉 数据库初始化完成!
```

seed 是幂等的：管理员已存在时只补系统管理员标记；密码来源为"数据库上次保存"时不会改写密码，也不会踢掉已登录会话。

## 运维

| 命令 | 说明 |
|------|------|
| `pnpm dev` / `pnpm build` / `pnpm preview` / `pnpm start` | 开发 / 构建 / 预览构建产物 / 生产启动 |
| `pnpm typecheck` | 类型检查（vue-tsc） |
| `pnpm db:generate` | 根据 `server/database/schema.ts` 生成迁移 SQL |
| `pnpm db:migrate` | 应用 `drizzle/` 中的迁移（默认测试库，生产需 `ALLOW_PROD_DB=1`） |
| `pnpm db:check` | 检查迁移文件是否冲突 |
| `pnpm db:studio` | Drizzle Studio 图形化查看/编辑数据 |
| `pnpm db:seed` | 初始化脚本（管理员、默认分类、`AUTH_SECRET`） |
| `pnpm db:reset-password` | 重置用户密码（不依赖邮件） |

**重置用户密码（两种方式任选）：**

1. **管理员后台重置**（推荐，无需 SSH）：管理员登录后台 → 用户管理 → 目标用户右侧「重置密码」→ 输入新密码。重置后该用户所有已登录设备强制下线。

2. **运维脚本**（服务器上执行）：

```bash
# 重置为指定密码
pnpm db:reset-password <用户名或邮箱> <新密码>

# 不传新密码 → 自动生成随机密码并打印
pnpm db:reset-password <用户名或邮箱>
```

> 脚本与后台重置效果一致：递增该用户的 token 版本，所有已登录设备强制下线。

## 项目结构

```
app/
├── pages/                # 路由页面
│   ├── index.vue         # 首页
│   ├── category/         # 分类页
│   ├── search.vue        # 搜索页
│   ├── login.vue         # 登录 / 注册 / 找回密码
│   └── dashboard/        # 管理后台（链接、分类、用户、导入导出、账户、设置）
├── layouts/              # 前台 / 后台布局
├── components/           # 公共组件（LinkCard、LinksGrid、CommandPalette、IconPicker …）
├── composables/          # 组合式函数（主题、强调色、toast、数据同步 …）
├── middleware/           # auth / admin 路由守卫
├── plugins/              # 客户端插件
└── assets/css/           # Tailwind v4 入口与设计令牌
server/
├── api/                  # Nitro 接口（auth / links / categories / search / import-export / favicon / nav …）
├── database/             # Drizzle schema、relations、Neon 客户端（HTTP 读 + WS 写）
├── middleware/           # 会话密钥就绪、CSRF Origin/Host 校验
└── utils/                # 缓存、限流、权限、识别、邮件、AI、加密等
shared/
└── types.ts              # 前后端共享类型
drizzle/                  # 迁移 SQL 与快照
scripts/
├── seed.ts               # 数据库初始化
└── reset-password.ts     # 重置用户密码
drizzle.config.ts         # 迁移配置（默认连 .env.development）
nuxt.config.ts            # 模块、runtimeConfig、安全头、会话配置
```

## License

Apache-2.0
