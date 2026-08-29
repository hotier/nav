"use client";

import * as React from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TruncatedTextProps {
  /** 内联渲染内容（文本、内联图标等），组件自身负责单行截断与省略号 */
  children: React.ReactNode;
  /** Tooltip 中展示的完整纯文本；缺省回退为 children */
  text?: string;
  /** 应用到外层容器（inline-block max-w-full truncate） */
  className?: string;
  /** Tooltip 气泡样式定制 */
  contentClassName?: string;
  /** 气泡方位，默认 "top" */
  side?: "top" | "right" | "bottom" | "left";
  /** 气泡对齐方式，默认 "start" */
  align?: "start" | "center" | "end";
  /** 气泡水平偏移量（px），如与容器左边框对齐时传负值 */
  alignOffset?: number;
  /** 悬停延迟（ms），默认 300 */
  delayDuration?: number;
}

/**
 * 单行截断感知的文本容器：容器自身做单行省略号截断，
 * 仅当内容真实溢出时，悬停 / 键盘聚焦才弹出 Tooltip 显示完整文本。
 */
function TruncatedText({
  children,
  text,
  className,
  contentClassName,
  side = "top",
  align = "start",
  alignOffset,
  delayDuration = 300,
}: TruncatedTextProps) {
  const textRef = React.useRef<HTMLSpanElement>(null);
  const [open, setOpen] = React.useState(false);

  const isOverflowing = React.useCallback(() => {
    const el = textRef.current;
    if (!el) return false;
    // 容器自身溢出（内联内容直接截断）
    if (
      el.scrollWidth > el.clientWidth + 1 ||
      el.scrollHeight > el.clientHeight + 1
    ) {
      return true;
    }
    // 直接子元素内部溢出（如 block 化链接自身 truncate）
    for (const child of Array.from(el.children)) {
      if (
        child.scrollWidth > child.clientWidth + 1 ||
        child.scrollHeight > child.clientHeight + 1
      ) {
        return true;
      }
    }
    return false;
  }, []);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (nextOpen && !isOverflowing()) {
        return; // 未溢出：吞掉打开请求
      }
      setOpen(nextOpen);
    },
    [isOverflowing]
  );

  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip open={open} onOpenChange={handleOpenChange}>
        <TooltipTrigger asChild>
          <span
            ref={textRef}
            tabIndex={0}
            className={cn(
              "inline-block max-w-full truncate outline-none",
              className
            )}
          >
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          align={align}
          alignOffset={alignOffset}
          arrowClassName="fill-black !left-1/2 -translate-x-1/2"
          className={cn(
            "max-w-[320px] break-words bg-black px-4 py-2.5 text-sm text-white shadow-lg ring-1 ring-white/15",
            contentClassName
          )}
        >
          {text ?? children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default TruncatedText;
