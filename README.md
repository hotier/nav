# OneNav

基于 Next.js 16 的书签导航管理系统。

## 功能

- 书签管理（增删改查、拖拽排序）
- 分类管理（二级分类、自定义图标）
- 网页信息自动识别（标题、描述、图标）
- 链接连通性检测
- AI 智能搜索（支持 OpenAI 兼容 API）
- 书签导入/导出（HTML / JSON）
- OAuth 登录（GitHub / Google）
- 多主题切换（浅色 / 深色 / 系统）
- 响应式设计 / PWA 支持
- 服务端图片代理（图标、头像不走客户端直连外部）

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

## 前置要求

- **Node.js** ≥ 18
- **pnpm** ≥ 11（`npm install -g pnpm`）
- **PostgreSQL** 数据库（本地或有公网地址的实例）

## 环境变量

复制示例文件并填写必要配置：

```bash
cp .env.example .env
```

| 变量 | 必填 | 说明 |
|------|:--:|------|
| `DATABASE_URL` | ✅ | PostgreSQL 连接串，格式见下方 |
| `ADMIN_PASSWORD` | | 管理员密码（原始值，seed.ts 自动 bcrypt 加密）。留空则部署时随机生成 8 位密码 |
| `ADMIN_EMAIL` | | 管理员邮箱，默认 `admin@example.com` |
| `AUTH_SECRET` | | NextAuth 密钥，**留空即可**，部署时自动生成 |
| `GITHUB_CLIENT_ID` | | GitHub OAuth（可选） |
| `GITHUB_CLIENT_SECRET` | | GitHub OAuth（可选） |
| `GOOGLE_CLIENT_ID` | | Google OAuth（可选） |
| `GOOGLE_CLIENT_SECRET` | | Google OAuth（可选） |
| `OPENAI_API_KEY` | | OpenAI API Key（可选，AI 搜索需要） |
| `OPENAI_BASE_URL` | | OpenAI 兼容 API 地址，默认 `https://api.openai.com/v1` |

**DATABASE_URL 格式：**

```
postgresql://用户名:密码@主机:端口/数据库名
```

**AUTH_SECRET 说明：**

`AUTH_SECRET` 无需手动填写。首次部署时 seed 脚本会自动生成 64 位十六进制随机串写入 `.env`，后续永远使用同一个值，不会重复生成。

**AUTH_URL 说明：**

无需配置。项目中已设置 `trustHost: true`，NextAuth 从请求头自动推断站点地址。

## 快速开始（本地开发）

```bash
# 1. 安装依赖（同时自动生成 Prisma Client）
pnpm install

# 2. 配置 .env（至少填写 DATABASE_URL）
cp .env.example .env

# 3. 建表 + 初始化（创建管理员账号）
pnpm prisma db push
pnpm prisma db seed

# 4. 启动开发服务器
pnpm dev
```

打开 http://localhost:3000

## 部署

### 方式一：Vercel

1. 导入 GitHub 仓库到 Vercel
2. 在 Vercel 项目设置中添加环境变量（至少 `DATABASE_URL`）
3. Vercel 自动检测 `vercel-build` 脚本执行部署

Vercel 部署流程：`pnpm install` → `prisma generate` → `prisma db push` → `prisma db seed` → `next build`

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

### 部署流程详解

执行 `pnpm deploy` 或 Vercel 自动部署时，依次执行：

```
1. prisma generate      → 根据 schema.prisma 生成类型安全的 Prisma Client
2. prisma db push       → 把 schema 同步到数据库（建表，不会丢失数据）
3. prisma db seed       → 初始化数据：
   a. checkDatabase()   → 检查 DATABASE_URL 是否配置 + 数据库是否连通
   b. ensureAuthSecret()→ 没有 AUTH_SECRET 则自动生成并写入 .env
   c. 创建管理员账号    → username=admin, name=admin
      - 密码：优先从 ADMIN_PASSWORD 环境变量读取
      - 没有则随机生成 8 位密码并打印到日志
      - 已存在管理员则跳过
   d. 创建默认分类
4. next build           → 构建生产版本
```

### 首次部署日志示例

```
🔍 检测数据库连接...
✅ 数据库连接正常
🔑 AUTH_SECRET: .env 中原占位已替换为真实值
   a3f8b2c1...
🌱 开始初始化数据库...
✅ 管理员账号已创建
   用户名: admin
   密码: Kx9mP2nQ
   邮箱: admin@example.com
   ⚠ 请妥善保管以上密码，本次部署后不再显示
✅ 默认分类已创建
🎉 数据库初始化完成!
```

### 启动生产服务器

```bash
pnpm start
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
│   ├── prisma.ts         # Prisma 客户端
│   ├── utils.ts          # 通用工具
│   └── ...
└── types/                # TypeScript 类型定义
prisma/
├── schema.prisma         # 数据库模型
└── seed.ts               # 数据库初始化脚本
```

## License

Apache-2.0
