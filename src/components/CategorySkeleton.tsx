"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * 估算单屏可显示的骨架卡片数量：
 * 按真实网格断点推列数（1/2/3/4/5 列），按视口高度推行数，取 列数 × 行数。
 */
function calcCardCount(): number {
  if (typeof window === "undefined") return 8; // SSR 默认，避免水合不一致
  const w = window.innerWidth;
  // 与 LinksGrid 真实断点保持一致
  const cols = w < 640 ? 1 : w < 1024 ? 2 : w < 1280 ? 3 : w < 1536 ? 4 : 5;
  const h = window.innerHeight;
  // 卡片行高（含间距）≈ 130px；页头/导航 ≈ 120px；一屏最多 5 行
  const rows = Math.min(5, Math.max(1, Math.floor((h - 120) / 130)));
  return cols * rows;
}

/**
 * 分类目录骨架屏：分类标题 + 链接卡片网格。
 * 用于分类页/首页加载、确认数据期间优先展示，避免直接显示空数据。
 * 未显式指定 cardCount 时，按设备类型和视口尺寸动态渲染"单页可显示的卡片数量"。
 */
export function CategorySkeleton({ cardCount }: { cardCount?: number }) {
  const [count, setCount] = useState(cardCount ?? 8);

  useEffect(() => {
    if (cardCount) {
      setCount(cardCount);
      return;
    }
    const update = () => setCount(calcCardCount());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [cardCount]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-5 w-8" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
