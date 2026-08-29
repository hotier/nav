# OneNav

基于 Next.js 16 的书签导航管理系统。

## 功能

- 书签管理（增删改查、拖拽排序、置顶、私有/隐藏）
- 分类管理（二级分类、自定义图标、公开/私有/隐藏）
- 网页信息自动识别（标题、描述、图标）
- 链接连通性检测
- AI 智能搜索（支持 OpenAI 兼容 API）
- 书签导入/导出（HTML / JSON）
- 多方式登录：账号密码 + GitHub / Google OAuth
- 忘记密码（邮件验证码，需配置 Resend；未配置时仍可由管理员后台或运维脚本重置密码）
- 多主题切换（浅色 / 深色 / 系统）
- 响应式设计 / PWA 支持
- 服务端图片代理（图标、头像不走客户端直连外部）
- 分级权限（系统管理员 / 管理员 / 普通用户）

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router) |
| 语言 | TypeScript |
| 数据库 | PostgreSQL（通过 Prisma ORM） |
| 认证 | NextAuth.js v5 |
| 样式 | Tailwind CSS v4 |
| 组件 | Radix UI + Lucide Icons |
| 包管理 | pnpm 11 |
| 缓存/限流 | Upstash Redis（可选，多实例部署推荐） |

## 前置要求

- **Node.js** ≥ 20.9（Next.js 16 要求，推荐使用 22 LTS）
- **pnpm** ≥ 11（`npm install -g pnpm`）
- **PostgreSQL** 数据库：本地实例、Docker 容器或 Neon / Supabase 等 Serverless Postgres 均可，需公网/部署环境可达

## 环境变量

复制示例文件并填写必要配置：

```bash
cp .env.example .env
```

| 变量 | 必填 | 说明 |
|------|:--:|------|
| `DATABASE_URL` | ✅ | PostgreSQL 连接串，格式见下方 |
| `AUTH_SECRET` | | NextAuth 密钥，**留空即可**，seed 会自动生成并持久化（见下文说明） |
| `ADMIN_USERNAME` | | 管理员用户名，默认 `admin` |
| `ADMIN_PASSWORD` | | 管理员初始密码（原始值，seed 自动 bcrypt 加密）。留空则自动生成 8 位随机密码 |
| `ADMIN_EMAIL` | | 管理员邮箱，默认 `admin@example.com` |
| `GITHUB_CLIENT_ID` | | GitHub OAuth 客户端 ID（可选） |
| `GITHUB_CLIENT_SECRET` | | GitHub OAuth 客户端密钥（可选） |
| `GOOGLE_CLIENT_ID` | | Google OAuth 客户端 ID（可选） |
| `GOOGLE_CLIENT_SECRET` | | Google OAuth 客户端密钥（可选） |
| `OPENAI_API_KEY` | | OpenAI API Key（可选，AI 搜索需要） |
| `OPENAI_BASE_URL` | | OpenAI 兼容 API 地址，默认 `https://api.openai.com/v1` |
| `UPSTASH_REDIS_REST_URL` | | Upstash Redis REST Endpoint（可选，多实例/Serverless 部署推荐，见下文） |
| `UPSTASH_REDIS_REST_TOKEN` | | Upstash Redis REST Token（可选，需要写权限） |
| `RESEND_API_KEY` | | Resend API Key（可选，仅"用户自助找回密码"需要；未配置时管理员仍可在后台重置密码） |
| `RESEND_FROM` | | 发件地址，如 `OneNav <noreply@your-domain.com>` |

**DATABASE_URL 格式：**

```
postgresql://用户名:密码@主机:端口/数据库名
```

> Neon 推荐使用**直连端点**（而非 pooled 端点），避免 PgBouncer 对部分查询的限制。直连示例：
> `postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require`

**AUTH_SECRET 说明（无需手动填写）：**

`AUTH_SECRET` 有三重来源，优先级从高到低：

1. 环境变量（部署平台注入）
2. 数据库 `AppSetting` 表（seed 时持久化，保证跨部署/跨实例一致）
3. 首次部署时 seed 自动生成，并同时写入：
   - `.env` 文件（本地/自有服务器场景）
   - 数据库 `AppSetting` 表
   - `src/lib/auth-secret.ts`（构建时编译进产物，NextAuth 运行时兜底）

因此无论 Vercel 还是自有服务器，**不配置 `AUTH_SECRET` 也能正常工作**，且多次部署/扩容不会导致密钥漂移导致会话失效。更稳妥的做法：首次部署后从日志中取出 `AUTH_SECRET` 手动添加到部署平台的环境变量。

**AUTH_URL 说明：**

无需配置。项目中已设置 `trustHost: true`，NextAuth 从请求头自动推断站点地址。

## 可选增强配置

### Upstash Redis（多实例/Serverless 部署推荐）

默认单实例下，SWR 数据缓存与认证接口限流计数使用进程内内存实现。多实例部署（如多个 serverless 函数/多副本容器）时，各实例缓存与计数彼此独立，推荐启用 Redis 共享：

- 在 https://console.upstash.com 创建数据库（选择 Global 或 Serverless、REST 协议）
- `UPSTASH_REDIS_REST_URL`：数据库详情页 REST API 的 Endpoint
- `UPSTASH_REDIS_REST_TOKEN`：同页的 Token（需要写权限，勿选 Read only）

不配置则自动降级为单实例内存实现，功能不受影响。

### Resend 邮件（忘记密码验证码）

**邮件服务仅影响"用户自助找回密码"**，不影响管理员重置密码：

- 配置了 Resend：用户在登录页点「忘记密码？」→ 邮箱收验证码 → 自助重置。
- 未配置 Resend：登录页/找回页会提示"请联系管理员"，此时仍可通过以下两种方式重置密码：
  1. **管理员后台**：登录后台 → 用户管理 → 目标用户「重置密码」按钮，直接设置新密码（不依赖邮件）。
  2. **运维脚本**：`scripts/reset-password.ts`（见「运维」章节）。

配置步骤：

- 在 https://resend.com 注册并添加域名，按提示配置 SPF / DKIM 的 DNS 记录
- 创建 API Key（Sending access，`re_` 开头）填入 `RESEND_API_KEY`
- `RESEND_FROM` 使用已验证的发送地址，例如 `OneNav <noreply@your-domain.com>`

## 快速开始（本地开发）

```bash
# 1. 安装依赖（postinstall 自动生成 Prisma Client）
pnpm install

# 2. 配置 .env（至少填写 DATABASE_URL）
cp .env.example .env

# 3. 建表 + 初始化（创建管理员账号）
pnpm prisma db push
pnpm prisma db seed

# 4. 启动开发服务器
pnpm dev
```

打开 http://localhost:3000，使用 seed 日志中打印的管理员账号登录。

## 部署

### 方式一：Vercel

1. 导入 GitHub 仓库到 Vercel
2. 在 Vercel 项目设置 → Environment Variables 中添加至少 `DATABASE_URL`（建议同时填写 `AUTH_SECRET`，更稳妥）
3. 构建命令自动使用 `vercel-build` 脚本，无需手动配置

Vercel 构建流程：`pnpm install` → `prisma generate` → `prisma db push` → `prisma db seed` → `next build`

注意：

- **构建期会执行 `db push` 和 `seed`**，因此 Vercel 的构建环境必须能访问你的数据库（使用公网可达的 PostgreSQL，并确认防火墙/白名单放行 Vercel 构建 IP）。
- Vercel 构建环境**没有持久磁盘**，seed 生成的 `AUTH_SECRET` 无法依赖 `.env` 文件，而是通过「数据库 `AppSetting` 表」+「编译进 `src/lib/auth-secret.ts`」两条路径保证运行期可用。若日志提示生成新密钥，建议复制到 Vercel 环境变量中固化。
- 生产环境建议在 Vercel 上同时配置 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`（多实例共享缓存与限流）与 `RESEND_API_KEY` / `RESEND_FROM`（忘记密码）。

### 方式二：自有服务器

```bash
# 1. 克隆代码
git clone <repo-url> && cd nav

# 2. 安装依赖
pnpm install

# 3. 配置 .env（至少填写 DATABASE_URL）
cp .env.example .env
# 编辑 .env，填写有效的 DATABASE_URL

# 4. 一键部署（建表 → 初始化 → 构建）
pnpm deploy
```

`pnpm deploy` 等价于：

```
prisma generate → prisma db push → prisma db seed → next build
```

**启动与守护：**

```bash
pnpm start   # 默认监听 http://localhost:3000
```

生产环境建议使用进程守护（二选一）：

```bash
# pm2
pm2 start "pnpm start" --name onenav

# systemd（示例）
# ExecStart=/usr/bin/pnpm start
# WorkingDirectory=/opt/nav
```

**反向代理：** 使用 Nginx / Caddy 将域名转发到 `http://127.0.0.1:3000` 并启用 HTTPS。所有静态资源、API、图片代理均走同一域名，无需额外配置。

**多实例部署：** 若按多副本运行（如 Docker Compose 多个副本、K8s 多 Pod），务必配置 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`，否则缓存与限流按实例独立，体验与安全均受影响。

**再次部署：** 重复执行 `pnpm deploy` 是幂等的——`db push` 不会丢数据，seed 不会重复创建管理员（已存在则跳过或仅做幂等修正），`AUTH_SECRET` 与管理员密码均从数据库读取，不会变化。

### 部署流程详解

执行 `pnpm deploy` 或 Vercel 自动部署时，依次执行：

```
1. prisma generate      → 根据 schema.prisma 生成类型安全的 Prisma Client
2. prisma db push       → 把 schema 同步到数据库（建表，不会丢失数据）
3. prisma db seed       → 初始化数据：
   a. checkDatabase()   → 检查 DATABASE_URL 是否配置 + 数据库是否连通
   b. AUTH_SECRET 解析  → env → 数据库 AppSetting 表 → 自动生成并持久化
                          （生成时写入 .env + 数据库 + src/lib/auth-secret.ts）
   c. 创建管理员账号    → username = ADMIN_USERNAME || "admin"
      - 密码：优先 ADMIN_PASSWORD → 数据库上次保存值 → 随机生成 8 位
      - 管理员已存在则幂等修正 isSystemAdmin，密码来源变更时更新密码
        （并递增 tokenVersion，使旧登录态失效）
   d. 创建默认分类      → 首个分类（slug 自动生成）
4. next build           → 构建生产版本
```

### 首次部署日志示例

```
🔍 检测数据库连接...
✅ 数据库连接正常
🔑 AUTH_SECRET: 已生成（.env + 当前进程）
   a3f8b2c1...
🌱 开始初始化数据库...
🔐 管理员密码: 自动生成
✅ 管理员账号已创建
   用户名: admin
   密码: Kx9mP2nQ
   邮箱: admin@example.com
   ⚠ 请妥善保管以上密码，本次部署后不再显示
✅ 默认分类已创建
🎉 数据库初始化完成!
```

## 运维

| 命令 | 说明 |
|------|------|
| `pnpm db:studio` | 打开 Prisma Studio 图形化查看/编辑数据 |
| `pnpm db:push` | 将 schema 同步到数据库（接受数据丢失） |
| `pnpm db:seed` | 手动执行 seed 初始化脚本 |
| `pnpm lint` / `pnpm lint:fix` | ESLint 检查 / 自动修复 |

**重置用户密码（不依赖邮件服务，两种方式任选）：**

1. **管理员后台重置**（推荐，无需 SSH）：管理员登录后台 → 用户管理 → 目标用户右侧「重置密码」→ 输入新密码。重置后该用户所有已登录设备将强制下线。

2. **运维脚本**（服务器上执行）：

```bash
# 重置为指定密码
npx ts-node --compiler-options {"module":"CommonJS"} scripts/reset-password.ts <用户名或邮箱> <新密码>

# 不传新密码 → 自动生成随机密码并打印
npx ts-node --compiler-options {"module":"CommonJS"} scripts/reset-password.ts <用户名或邮箱>
```

> 脚本与后台重置效果一致：该用户所有已登录设备将强制下线。OAuth 账号（无本地密码）不适用，请直接通过 GitHub/Google 登录。

**排序数据迁移（旧版本升级用）：**

```bash
npx ts-node --compiler-options {"module":"CommonJS"} scripts/migrate-sort-order.ts
```

## 项目结构

```
src/
├── app/
│   ├── (main)/           # 前台页面（首页、分类页、搜索页）
│   ├── api/              # API 路由
│   │   ├── account/      # 账户管理
│   │   ├── ai/           # AI 搜索
│   │   ├── auth/         # NextAuth 认证
│   │   ├── categories/   # 分类 CRUD
│   │   ├── favicon/      # 图片代理
│   │   ├── import-export/# 导入导出
│   │   └── links/        # 链接 CRUD / 识别 / 连通性检测
│   ├── dashboard/        # 管理后台（链接、分类、设置、账户）
│   └── login/            # 登录页
├── components/           # 公共组件
│   ├── ui/               # Radix UI 基础组件
│   ├── MainLayout.tsx    # 前台布局
│   ├── AdminLayout.tsx   # 后台布局
│   ├── LinkCard.tsx      # 书签卡片
│   ├── LinkForm.tsx      # 链接表单
│   └── LinksGrid.tsx     # 书签网格
├── lib/                  # 工具函数
│   ├── auth.ts           # NextAuth 配置
│   ├── auth-secret.ts    # AUTH_SECRET 构建时注入（seed 自动生成，勿手改）
│   ├── prisma.ts         # Prisma 客户端
│   ├── cache.ts          # SWR 数据缓存（内存 / Upstash Redis）
│   ├── rate-limit.ts     # 认证接口限流
│   └── utils.ts          # 通用工具
└── types/                # TypeScript 类型定义
prisma/
├── schema.prisma         # 数据库模型
└── seed.ts               # 数据库初始化脚本
scripts/
├── reset-password.ts     # 重置用户密码
└── migrate-sort-order.ts # 排序数据迁移
```

## License

Apache-2.0
