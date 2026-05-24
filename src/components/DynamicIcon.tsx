"use client";

import React, { useState, useEffect } from "react";
import { Folder } from "lucide-react";
import { getIconComponent, loadLucideModule } from "@/lib/icons";

/**
 * 动态渲染任意 lucide 图标（统一的图标渲染入口）
 * - ICON_MAP 中的图标：同步渲染，0 延迟
 * - 其他图标：先从缓存取，无缓存则异步加载（短暂显示 Folder 兜底）
 */
export function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const staticComp = getIconComponent(name);
  const [dynComp, setDynComp] = useState<React.ComponentType<{ className?: string }> | null>(
    () => (staticComp ? null : (getIconComponent(name) ?? null))
  );

  useEffect(() => {
    if (staticComp) {
      setDynComp(null);
      return;
    }
    const cached = getIconComponent(name);
    if (cached) {
      setDynComp(() => cached);
      return;
    }
    let cancelled = false;
    loadLucideModule().then(() => {
      if (!cancelled) {
        const comp = getIconComponent(name);
        if (comp) setDynComp(() => comp);
      }
    });
    return () => { cancelled = true; };
  }, [name, staticComp]);

  if (staticComp) return React.createElement(staticComp, { className });
  if (dynComp) return React.createElement(dynComp, { className });
  return <Folder className={className} />;
}
