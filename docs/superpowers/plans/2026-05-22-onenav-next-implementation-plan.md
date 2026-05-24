# OneNav Next 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用 Next.js 完整复刻 OneNav 书签管理系统，部署至 Vercel

**Architecture:** 基于 Next.js 16 App Router，使用 Vercel Postgres 存储数据，Prisma 作为 ORM，NextAuth.js 处理认证。前台展示书签列表，后台管理系统支持完整 CRUD。

**Tech Stack:** Next.js 16, TypeScript, Prisma, Vercel Postgres, NextAuth.js, Tailwind CSS, shadcn/ui, OpenAI API

---

## 文件结构概览

```
onenav-next/
├── prisma/
│   └── schema.prisma              # 数据库模型定义
├── src/
│   ├── app/
│   │   ├── (main)/               # 前台页面组
│   │   ├── page.tsx              # 首页
│   │   └── category/
│   │       └── [id]/
│   │           └── page.tsx      # 分类页
│   ├── (admin)/                  # 管理后台组
│   ├── api/                      # API Routes
│   ├── components/               # 组件
│   ├── lib/                      # 工具库
│   └── types/                    # TypeScript 类型
├── .env.local
├── package.json
└── tailwind.config.ts
```

---

## Phase 1: 项目初始化

### Task 1: 初始化 Next.js 项目

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.js`
- Create: `tailwind.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/globals.css`

### Task 2: 配置 Prisma 和数据库

**Files:**
- Create: `prisma/schema.prisma`
- Create: `.env.local`
- Create: `src/lib/prisma.ts`

### Task 3: 配置 NextAuth.js 认证

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/types/next-auth.d.ts`

---

## Phase 2: 核心功能

### Task 4: 创建基础 UI 组件

**Files:**
- Create: `src/lib/utils.ts`
- Create: `src/components/ThemeProvider.tsx`
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/card.tsx`
- Create: `src/components/ui/dialog.tsx`
- Create: `src/components/ui/dropdown-menu.tsx`
- Create: `src/components/ui/context-menu.tsx`

### Task 5: 实现分类管理 API

**Files:**
- Create: `src/types/index.ts`
- Create: `src/lib/validators.ts`
- Create: `src/app/api/categories/route.ts`
- Create: `src/app/api/categories/[id]/route.ts`

### Task 6: 实现链接管理 API

**Files:**
- Create: `src/app/api/links/route.ts`
- Create: `src/app/api/links/[id]/route.ts`

### Task 7: 实现搜索和 AI 检索 API

**Files:**
- Create: `src/lib/openai.ts`
- Create: `src/app/api/search/route.ts`
- Create: `src/app/api/ai/route.ts`

### Task 8: 实现导入导出功能

**Files:**
- Create: `src/app/api/import-export/import/route.ts`
- Create: `src/app/api/import-export/export/route.ts`
- Create: `src/lib/parser.ts` (HTML/JSON 解析)

---

## Phase 3: 前台页面

### Task 9: 前台页面布局和组件

**Files:**
- Create: `src/app/(main)/layout.tsx`
- Create: `src/components/LinkCard.tsx`
- Create: `src/components/CategoryList.tsx`
- Create: `src/components/SearchBar.tsx`
- Create: `src/components/ThemeSwitcher.tsx`

### Task 10: 首页实现

**Files:**
- Create: `src/app/(main)/page.tsx`

### Task 11: 分类页面实现

**Files:**
- Create: `src/app/(main)/category/[id]/page.tsx`

---

## Phase 4: 管理后台

### Task 12: 管理后台布局

**Files:**
- Create: `src/app/(admin)/layout.tsx`
- Create: `src/components/admin/Sidebar.tsx`
- Create: `src/components/admin/AdminHeader.tsx`

### Task 13: 仪表盘页面

**Files:**
- Create: `src/app/(admin)/dashboard/page.tsx`

### Task 14: 链接管理页面

**Files:**
- Create: `src/app/(admin)/links/page.tsx`
- Create: `src/components/admin/LinkTable.tsx`
- Create: `src/components/admin/LinkForm.tsx`

### Task 15: 分类管理页面

**Files:**
- Create: `src/app/(admin)/categories/page.tsx`
- Create: `src/components/admin/CategoryTree.tsx`
- Create: `src/components/admin/CategoryForm.tsx`

### Task 16: 设置页面

**Files:**
- Create: `src/app/(admin)/settings/page.tsx`
- Create: `src/components/admin/ThemeSettings.tsx`
- Create: `src/components/admin/AISettings.tsx`

---

## Phase 5: 高级功能

### Task 17: 拖拽排序功能

**Files:**
- Create: `src/components/DraggableList.tsx`
- Modify: `src/app/api/links/route.ts` (添加批量更新排序)

### Task 18: 右键菜单组件

**Files:**
- Create: `src/components/ContextMenu.tsx`
- Create: `src/components/QrCodeModal.tsx`

### Task 19: 链接检测功能

**Files:**
- Create: `src/components/LinkDetector.tsx`
- Create: `src/app/api/links/check/route.ts`

---

## Phase 6: PWA 和部署

### Task 20: PWA 配置

**Files:**
- Create: `public/manifest.json`
- Create: `public/sw.js`
- Modify: `src/app/layout.tsx`

### Task 21: 登录页面

**Files:**
- Create: `src/app/login/page.tsx`

### Task 22: Vercel 部署配置

**Files:**
- Create: `vercel.json`
- Create: `app.yaml` (如果需要)

---

## 实施优先级

1. **Phase 1 (Task 1-3)**: 项目初始化、数据库配置、认证配置
2. **Phase 2 (Task 4-8)**: UI 组件、分类/链接 API、搜索/AI API
3. **Phase 3 (Task 9-11)**: 前台页面展示
4. **Phase 4 (Task 12-16)**: 管理后台
5. **Phase 5 (Task 17-19)**: 拖拽排序、右键菜单、链接检测
6. **Phase 6 (Task 20-22)**: PWA、登录页、部署

---

## 估算工作量

- Phase 1: 基础搭建 - 3-4 小时
- Phase 2: 核心功能 - 6-8 小时
- Phase 3: 前台页面 - 3-4 小时
- Phase 4: 管理后台 - 6-8 小时
- Phase 5: 高级功能 - 4-5 小时
- Phase 6: PWA 和部署 - 2-3 小时

**总计: 约 24-32 小时**
