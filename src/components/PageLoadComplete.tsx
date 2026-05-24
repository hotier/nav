"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { doneTopLoader } from "@/components/TopLoader";

/**
 * 包裹在根布局 children 外，每次路由切换后触发 doneTopLoader
 *
 * 效果：
 *   - 页面渲染完成 < 600ms → 延迟期被取消，进度条从不出现
 *   - 页面渲染完成 > 600ms → 已出现的进度条跳到 100% 再淡出
 */
export function PageLoadComplete({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    // requestAnimationFrame 确保在浏览器完成绘制后触发
    const id = requestAnimationFrame(() => {
      doneTopLoader();
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return <>{children}</>;
}
