# 设计文档：标题单行截断 + Tooltip 预览

状态：待审查
日期：2026-08-29

## 1. 背景与目标

链接管理页标题列（`src/app/dashboard/links/page.tsx`）目前不限制行数，长标题会换行撑高行高。目标：

1. 标题最多显示一行，超出部分用省略号截断；
2. 鼠标悬停（或键盘聚焦）时，以 Tooltip 预览完整标题；
3. 创建**通用 Tooltip 组件**，供全站复用（分类名、LinkCard 标题等）。

## 2. 技术选型

- **Radix UI Tooltip**（`@radix-ui/react-tooltip`，约 40KB）：无障碍、视口边缘自动翻转、键盘可达性开箱即用。
- 与项目现有 shadcn/ui 目录风格一致（参照 `dropdown-menu.tsx`、`dialog.tsx` 的封装方式）。
- 项目已具备 `tw-animate-css`，tooltip 动画类（`animate-in fade-in-0 zoom-in-95` 等）可直接使用。

## 3. 交付物

### 3.1 依赖

```bash
pnpm add @radix-ui/react-tooltip
```

### 3.2 `src/components/ui/tooltip.tsx`（通用四件套，shadcn 标准）

- `"use client"`，`React.forwardRef` + `cn()`，与现有 ui 组件风格一致。
- 导出：`TooltipProvider`、`Tooltip`、`TooltipTrigger`、`TooltipContent`。
- `TooltipContent`：`z-50`、深色底（`bg-primary text-primary-foreground`）、`rounded-md px-3 py-1.5 text-xs`、带开合动画；默认 `sideOffset={4}`；`Portal` 渲染避免被 `overflow-hidden` 裁切。
- 此文件即用户要求的"通用 Tooltip 组件"，未来任何场景可直接 import 使用。

### 3.3 `src/components/TruncatedText.tsx`（截断感知封装）

在四件套之上的高复用封装，核心价值：**仅当文本真实溢出时才启用 Tooltip**。

```tsx
interface TruncatedTextProps {
  children: React.ReactNode;   // 内联渲染内容（文本、内联图标等），容器自身负责截断
  text?: string;               // Tooltip 中展示的完整纯文本；缺省回退为 children
  className?: string;          // 应用到外层容器
  contentClassName?: string;   // Tooltip 气泡样式定制
  side?: "top" | "right" | "bottom" | "left";   // 默认 "top"
  align?: "start" | "center" | "end";           // 默认 "start"
  delayDuration?: number;      // 悬停延迟，默认 300ms
}
```

实现要点：

- 容器：`<span ref>` + `inline-block max-w-full truncate outline-none`（容器自身做单行省略号截断，测量对象与截断对象合一；`tabIndex={0}` 支持键盘聚焦触发）。
- **受控开关**：`open` 受控，`onOpenChange` 时实时测量
  `el.scrollWidth > el.clientWidth + 1`，未溢出则吞掉打开请求：

  ```tsx
  const handleOpenChange = (open: boolean) => {
    const el = textRef.current;
    if (open && el && el.scrollWidth <= el.clientWidth + 1) return;
    setOpen(open);
  };
  ```

  该方式无需 ResizeObserver/窗口 resize 监听，悬停瞬间测量即准确。
- 组件内部自带 `TooltipProvider`（`delayDuration` 可配），开箱即用、零配置。
- `TooltipContent` 默认 `max-w-[320px] break-words`，防超长标题撑破视口。

### 3.4 标题列改造（`src/app/dashboard/links/page.tsx`）

将 1230-1237 行的单元格改为：

```tsx
<TableCell className="max-w-[250px] font-medium">
  <TruncatedText text={link.title} className="w-full cursor-default">
    {link.isPinned && (
      <span className="text-primary mr-1" title="已置顶">📌</span>
    )}
    {highlightText(link.title, searchQuery)}
  </TruncatedText>
</TableCell>
```

要点：

- 表头列已有 `w-[250px]`（1194 行），单元格补 `max-w-[250px]` 形成宽度约束；
- 截断与省略号由 `TruncatedText` 容器自身的 `truncate` 承担，children 保持内联（避免中间 flex 层导致外层无法感知溢出）；
- 置顶 📌 图标保留为内联元素，不参与截断；
- Tooltip 内展示纯文本 `link.title`（避免把 `<mark>` 高亮标签渲染进气泡）。

## 4. 验证

1. `pnpm dev` 手动验证：
   - 长标题显示为一行 + 省略号；悬停 300ms 后气泡显示完整标题；
   - 短标题悬停不弹气泡；
   - 气泡贴近视口右/下边缘时自动翻转位置；
   - 搜索高亮后悬停，气泡仍显示完整纯文本标题；
   - 键盘 Tab 聚焦标题也可触发气泡。
2. `pnpm lint` 无新增错误。

## 5. 非目标（后续可选）

- LinkCard / 首页卡片标题的截断复用（组件已通用，按需接入）。
- 气泡内高亮显示与标题匹配部分。
