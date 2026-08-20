# 计划：shadcn 视觉统一改造

依赖设计文档：2026-08-20-shadcn-ui-unification-design.md

## 执行步骤

1. **button.tsx 令牌化**
   - default: `bg-primary text-primary-foreground hover:bg-primary/90`
   - destructive: `bg-destructive text-destructive-foreground hover:bg-destructive/90`
   - outline: `border border-input bg-background hover:bg-accent hover:text-accent-foreground`
   - secondary: `bg-secondary text-secondary-foreground hover:bg-secondary/80`
   - ghost: `hover:bg-accent hover:text-accent-foreground`
   - link: `text-primary underline-offset-4 hover:underline`
   - 去掉所有 `blue-*` / `cyan-*` / `shadow-blue-*` 硬编码

2. **前台 MainLayout.tsx**
   - 渐变 logo/头像/活跃导航：`from-blue-500 via-sky-500 to-cyan-500` → `from-primary via-sky-500 to-cyan-500`
   - `#3498db`（移动菜单标题）→ `text-primary`
   - 登录按钮 `bg-gradient-to-r from-blue-500 to-sky-500 ...` → 改用 Button default（已纯色 primary）
   - 中性 `slate-*` → 令牌（见设计文档映射表）
   - 搜索框/下拉/侧栏同步

3. **LinkCard.tsx**
   - 卡片 `hover:border-blue-400` → `hover:border-primary`
   - favicon 回退 `text-[#3498db]` / `from-blue-500/10` → `text-primary` / `from-primary/10`
   - 操作按钮 `hover:text-blue-500` → `hover:text-primary`
   - 文字 `slate-*` → `foreground` / `muted-foreground`

4. **AdminLayout.tsx**
   - 渐变 logo/头像：`from-blue-500 via-sky-500 to-cyan-500` → `from-primary via-sky-500 to-cyan-500`
   - 侧栏活跃态 `from-blue-100 to-cyan-100` / `text-blue-600` → 令牌（`bg-primary/10 text-primary` 等）
   - `text-blue-500` 高亮 → `text-primary`
   - 中性 `slate-*` → 令牌

5. **认证页 login / reset-pwd**
   - logo 渐变改 `from-primary via-sky-500 to-cyan-500`
   - 提交按钮 `bg-gradient-to-r from-blue-500 to-sky-500` → Button default（纯色 primary）
   - 中性 `slate-*` → 令牌

6. **Dashboard 页面（7 个）**
   - `dashboard/page.tsx`：活跃态渐变 → `bg-primary`；按钮渐变 → Button default
   - 其余页 `slate-*` / `blue-*` 中性与高亮 → 令牌

7. **其余命中文件（ThemeSwitcher / SiteFooter / IconPicker / CategoryLinkManager /
   HomeContentClient / LinkForm / ConfirmDialog / CategoryContentClient / SearchContent / users page 等）**
   - 统一 `slate-*` / `blue-*` / `#3498db` → 令牌

8. **校验**
   - 跑 `.\node_modules\.bin\tsc.cmd --noEmit`
   - 检查无残留 `blue-500` / `#3498db`（品牌渐变首段已换 primary，可搜 `from-blue-500` 确认清零）

## 验收

- `tsc` 零错误
- 全站搜索 `from-blue-500`、`#3498db`、`text-\[#3498db\]` 命中为零（品牌渐变已统一为 `from-primary`）
- 亮/暗色下视觉统一到一套蓝
