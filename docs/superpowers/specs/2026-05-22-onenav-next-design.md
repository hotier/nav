# OneNav Next.js 版本设计规范

**创建日期**: 2026-05-22
**项目名称**: OneNav Next
**项目类型**: 书签管理系统 / Web 应用
**技术栈**: Next.js 16 + TypeScript + Vercel Postgres + Prisma + NextAuth.js

---

## 1. 项目概述

### 1.1 项目目标

复刻 [helloxz/onenav](https://github.com/helloxz/onenav) 项目，使用 Next.js 框架重写，部署于 Vercel 平台。保留原版所有核心功能，并利用 Next.js 生态获得更好的开发体验和性能。

### 1.2 原版功能参考

- AI 检索匹配链接
- 链接批量检测（死链检测）
- 后台管理
- 私有链接
- Chrome/Firefox/Edge 书签批量导入
- 多种主题风格
- 链接信息自动识别
- API 支持
- Docker 部署
- 二级分类
- 浏览器扩展（插件）支持
- 后台一键在线升级
- 链接拖拽排序
- PWA 应用
- 手机版后台
- 书签搜索
- 右键菜单（打开链接、打开备用链接、复制链接、显示二维码、编辑链接、删除链接）

---

## 2. 技术架构

### 2.1 技术选型

| 类别 | 选择 |
|------|------|
| 框架 | Next.js 15 (App Router) |
| 语言 | TypeScript |
| 数据库 | Vercel Postgres |
| ORM | Prisma |
| 认证 | NextAuth.js (Auth.js) v5 |
| AI 接入 | OpenAI 协议 (GPT 系列) |
| 样式 | Tailwind CSS |
| UI 组件 | shadcn/ui |
| 部署平台 | Vercel |

### 2.2 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         Vercel 部署                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Next.js   │  │   Next.js   │  │      API Routes          │  │
│  │  App Router │  │   Pages     │  │  (Serverless Functions)   │  │
│  │   前台页面   │  │   管理后台   │  │  /api/links              │  │
│  └─────────────┘  └─────────────┘  │  /api/categories         │  │
│                                     │  /api/search             │  │
│                                     │  /api/ai                 │  │
│                                     │  /api/import-export      │  │
│                                     └─────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                      Prisma ORM                                  │
├─────────────────────────────────────────────────────────────────┤
│                   Vercel Postgres                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 数据库模型

### 3.1 Link (链接)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string (CUID) | 主键 |
| title | string | 链接标题 |
| url | string | 链接地址 |
| description | string? | 描述 |
| favicon | string? | 网站图标 |
| categoryId | string | 所属分类 ID |
| userId | string | 所属用户 ID |
| isPrivate | boolean | 是否私有 |
| isPinned | boolean | 是否置顶 |
| sortOrder | int | 排序序号 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

### 3.2 Category (分类)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string (CUID) | 主键 |
| name | string | 分类名称 |
| icon | string? | 图标 |
| parentId | string? | 父分类 ID（二级分类） |
| userId | string | 所属用户 ID |
| sortOrder | int | 排序序号 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

### 3.3 User (用户)

使用 NextAuth.js 内置的 User 模型。

---

## 4. 功能模块

### 4.1 核心功能

- [x] 书签增删改查
- [x] 分类管理（二级分类）
- [x] 书签搜索（模糊搜索）
- [x] 链接检测（死链检测）

### 4.2 AI 功能

- [x] AI 检索：用户输入关键词，AI 匹配相关链接
- [x] OpenAI 协议接入，支持自定义 API Endpoint

### 4.3 认证系统

- [x] NextAuth.js 认证
- [x] 支持多种登录方式（GitHub, Google, 邮箱等）
- [x] 管理员模式

### 4.4 导入导出

- [x] HTML 导入：解析浏览器导出的书签 HTML 文件
- [x] JSON 导入/导出：统一数据格式

### 4.5 主题系统

- [x] 运行时主题切换
- [x] 预设 2-3 套主题
- [x] 主题偏好存储在 localStorage

### 4.6 PWA 支持

- [x] PWA 配置
- [x] Service Worker
- [x] Web App Manifest

### 4.7 其他功能

- [x] 拖拽排序
- [x] 右键菜单
- [x] 二维码生成
- [x] 响应式设计（手机版后台）
- [x] API 接口

---

## 5. 页面结构

### 5.1 前台页面 `(main)`

- `/` - 首页（展示所有公开书签）
- `/category/[id]` - 分类页面

### 5.2 管理后台 `(admin)`

- `/dashboard` - 管理仪表盘
- `/links` - 链接管理
- `/categories` - 分类管理
- `/settings` - 系统设置

### 5.3 API Routes

- `POST /api/auth/*` - 认证相关
- `GET/POST /api/links` - 链接 CRUD
- `GET/PUT/DELETE /api/links/[id]` - 单个链接操作
- `GET/POST /api/categories` - 分类 CRUD
- `GET/PUT/DELETE /api/categories/[id]` - 单个分类操作
- `POST /api/search` - 搜索
- `POST /api/ai` - AI 检索
- `POST /api/import` - 导入
- `GET /api/export` - 导出

---

## 6. 项目结构

```
onenav-next/
├── prisma/
│   └── schema.prisma          # 数据库模型
├── src/
│   ├── app/
│   │   ├── (main)/             # 前台页面组
│   │   │   ├── page.tsx        # 首页
│   │   │   └── category/[id]/   # 分类页面
│   │   ├── (admin)/             # 管理后台组
│   │   │   ├── dashboard/       # 管理仪表盘
│   │   │   ├── links/           # 链接管理
│   │   │   ├── categories/      # 分类管理
│   │   │   └── settings/        # 系统设置
│   │   ├── api/                 # API Routes
│   │   │   ├── auth/            # 认证 API
│   │   │   ├── links/           # 链接 CRUD
│   │   │   ├── categories/      # 分类 CRUD
│   │   │   ├── search/          # 搜索
│   │   │   ├── ai/              # AI 检索
│   │   │   └── import-export/   # 导入导出
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                 # 基础 UI 组件
│   │   ├── links/              # 链接相关组件
│   │   ├── categories/         # 分类组件
│   │   ├── search/             # 搜索组件
│   │   ├── theme/              # 主题切换
│   │   └── admin/              # 管理后台组件
│   ├── lib/
│   │   ├── prisma.ts          # Prisma 客户端
│   │   ├── auth.ts             # NextAuth 配置
│   │   ├── openai.ts          # OpenAI 客户端
│   │   └── utils.ts           # 工具函数
│   ├── styles/
│   │   └── themes/            # 主题样式
│   └── types/
│       └── index.ts           # TypeScript 类型
├── public/
│   └── icons/                  # PWA 图标
├── .env.local                  # 环境变量
└── package.json
```

---

## 7. 实施计划优先级

### Phase 1: 基础搭建
1. 初始化 Next.js 项目
2. 配置 Prisma 和 Vercel Postgres
3. 配置 NextAuth.js
4. 创建基础数据库模型

### Phase 2: 核心功能
5. 实现分类管理
6. 实现链接管理
7. 实现前台展示
8. 实现搜索功能

### Phase 3: 高级功能
9. 实现 AI 检索
10. 实现链接检测
11. 实现导入导出
12. 实现拖拽排序

### Phase 4: 完善功能
13. 实现主题切换
14. 实现 PWA
15. 实现响应式优化
16. API 文档整理

---

## 8. 设计决策记录

| 日期 | 决策项 | 选择 | 理由 |
|------|--------|------|------|
| 2026-05-22 | 功能范围 | 完整复刻 | 保留原版所有核心功能 |
| 2026-05-22 | 数据库 | Vercel Postgres + Prisma | 与 Vercel 平台高度集成 |
| 2026-05-22 | 主题风格 | 复刻原版 default2 | 用户要求 |
| 2026-05-22 | AI 功能 | OpenAI 协议接入 | 用户已有 OpenAI 兼容 API |
| 2026-05-22 | 用户认证 | NextAuth.js | Next.js 官方推荐方案 |
| 2026-05-22 | 导入导出 | HTML + JSON | 兼容浏览器书签迁移 |
| 2026-05-22 | 主题系统 | 运行时切换 | 提供 2-3 套预设主题 |
