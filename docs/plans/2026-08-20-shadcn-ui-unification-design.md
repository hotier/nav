# 设计文档：shadcn 视觉统一改造

日期：2026-08-20

## 背景

项目已有 shadcn 底座（`src/components/ui/` 下 10 个原子组件），`globals.css` 也定义了完整的 shadcn 设计令牌
（`--color-primary`、`--color-muted-foreground`、`--color-card` 等）。但页面层（前台 `MainLayout`/`LinkCard`、
后台 `AdminLayout`/各 dashboard 页、登录/改密页）大量裸用硬编码的 Tailwind 类：

- 品牌蓝：`blue-500/600` + `sky-500` + `cyan-500` 的渐变
- 中性色：`slate-400/500/600/700/800`
- 硬编码十六进制：`#3498db`

这与令牌有两套不一致：
1. 渐变用 `blue-500` 而非令牌 `primary: hsl(204 90% 56%)`
2. `slate-*` 与令牌 `muted-foreground: hsl(0 0% 45%)` / `muted` / `border` 在色相/明度上不匹配，
   深色模式更是用 `slate-700/800` 而非令牌 `card/background`

造成"三套蓝不统一"的观感割裂。

## 目标

把全部页面层与原子组件的视觉收敛到 shadcn 令牌，达成"前台后台统一、一套蓝"。

## 设计决策（已与用户确认）

1. **主按钮（button.tsx default variant）**：去掉 `blue-500` 渐变，改为 `bg-primary text-primary-foreground`
   （标准 shadcn 纯色）。destructive/outline/secondary/ghost/link 同步用令牌替换硬编码蓝。

2. **品牌装饰渐变（logo / 头像 / 活跃导航高亮）**：保留渐变作为品牌语言，但改用令牌——
   `from-primary via-sky-500 to-cyan-500`（仅把首段的 `blue-500` 换成 `primary` 令牌变量，
   保留后续的 sky/cyan 相邻色维持渐变层次）。

3. **中性色统一令牌映射**：
   | 原裸用类 | 替换为令牌类 |
   |---|---|
   | `slate-400` / `slate-500`（次要文字） | `muted-foreground` |
   | `slate-600`（普通文字） | `foreground` 或 `muted-foreground`（按层级） |
   | `slate-700` / `slate-800`（标题/强调） | `foreground` |
   | `slate-100/200`（浅灰底/边框） | `muted` / `border` |
   | `slate-50`（输入框底） | `muted` |
   | 深色 `slate-700/800`（卡片/侧栏底） | `card` / `background` |
   | `#3498db`（硬编码蓝） | `primary` |
   | `blue-400`（hover 高亮） | `primary` |

   说明：Tailwind v4 + `@theme` 已把 `--color-muted-foreground` 暴露为 `text-muted-foreground` 等工具类，
   可直接用，无需新增 CSS。

4. **红色（删除/退出）**：`red-600` / `red-50` / `red-900/20` 保留——`destructive` 令牌是 `hsl(4 90% 58%)`
   接近 red-500，但语义清晰且非本次"蓝不统一"问题，保持现状即可（不强行改）。

5. **不改变整体配色风格**：保持蓝调主色，不引入新色相（violet/amber 等现有语义色不动）。
   Dashboard 的 `.gradient-text` / `.glass-effect` 等 CSS 类维持原样（属装饰动效，非令牌冲突）。

## 改造范围（文件清单）

### 原子组件（1）
- `src/components/ui/button.tsx`：5 个 variant 全部改令牌 + primary 纯色

### 前台布局/组件（3）
- `src/components/MainLayout.tsx`：header/侧栏/搜索框/登录按钮/下拉/移动菜单
- `src/components/LinkCard.tsx`：卡片边框 hover、favicon 回退、文字层级、操作按钮
- `src/components/CategoryContentClient.tsx`：空态/标题文字

### 后台布局（1）
- `src/components/AdminLayout.tsx`：装饰背景、侧栏导航、header、下拉、移动菜单

### 认证页（2）
- `src/app/login/page.tsx`
- `src/app/reset-pwd/page.tsx`

### Dashboard 页面（7）
- `src/app/dashboard/page.tsx`（活跃态导航 + 渐变按钮）
- `src/app/dashboard/links/page.tsx`
- `src/app/dashboard/categories/page.tsx`
- `src/app/dashboard/users/page.tsx`
- `src/app/dashboard/account/page.tsx`
- `src/app/dashboard/settings/page.tsx`
- `src/app/dashboard/import-export/page.tsx`

### 前台搜索（1）
- `src/app/(main)/search/SearchContent.tsx`

> 说明：`ThemeSwitcher`、`SiteFooter`、`IconPicker`、`CategoryLinkManager`、`HomeContentClient`、`LinkForm`、
> `ConfirmDialog` 也命中裸色，但属次要或已部分用 shadcn，纳入同批映射替换，保证一致性。

## 不变量 / 校验

- 不引入新 CSS 变量，全部复用 `@theme` 已暴露的工具类。
- 不改动布局结构、交互逻辑、动画（仅换 class）。
- 完成跑 `tsc --noEmit` 确认无类型错误（纯 class 改动不应引入类型问题，仅兜底）。
- 手动回归建议：`pnpm dev` 检查前台首页、分类页、搜索页、登录页、dashboard 各页在亮/暗色下的视觉一致性。

## 风险

- `slate-*` → 令牌的近似映射可能造成个别处明暗微调，属预期内"统一"收益。
- Dashboard 的 `stat-card` 等 CSS 类用 `var(--color-card)` 已正确，无需动。
