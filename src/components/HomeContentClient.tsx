"use client";

import { LinksGrid } from "@/components/LinksGrid";
import { useDataCache } from "@/hooks/useDataCache";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import type { Link as LinkType, Category } from "@/types";
import { Home, Loader2 } from "lucide-react";

interface Props {
  userId: string | null;
  linkCount: number;
  isAdmin: boolean;
}

export function HomeContentClient({ userId, linkCount, isAdmin }: Props) {
  const { data: catData, loading: catLoading } = useDataCache({ configs: [
    {
      name: "Category",
      fetch: () =>
        fetch("/api/categories")
          .then((r) => r.json())
          .then((d: Category[]) => ({ data: d, total: d.length })),
    },
  ], userId });

  const { items: links, total, hasMore, isLoadingMore, loading: linksLoading, sentinelRef } = useInfiniteScroll<LinkType>({
    name: "Link",
    userId,
    autoPageSize: { cardHeight: 140, columns: () => {
      const w = window.innerWidth;
      if (w >= 1536) return 5;  // 2xl
      if (w >= 1280) return 4;  // xl
      if (w >= 1024) return 3;  // lg
      if (w >= 640) return 2;   // sm
      return 1;
    }},
    fetchFn: (page, pageSize) =>
      fetch(`/api/links?includePrivate=true&page=${page}&pageSize=${pageSize}&sort=recent`)
        .then((r) => r.json())
        .then((d: { data: LinkType[]; total: number }) => ({ data: d.data, total: d.total })),
  });

  const categories = (catData["Category"] || []) as Category[];
  const displayCount = linkCount || total || links.length;

  // 加载中 → 骨架
  if (linksLoading && links.length === 0) {
    return (
      <>
        <div className="mb-6">
          <div className="flex items-center gap-2.5">
            <Home className="h-6 w-6 text-slate-800 dark:text-white" />
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white"
              style={{ fontFamily: "var(--font-space-grotesk)" }}>
              全部书签
            </h2>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 animate-pulse">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-24 rounded bg-muted" />
                  <div className="h-3 w-32 rounded bg-muted" />
                </div>
              </div>
              <div className="h-3 w-3/4 rounded bg-muted" />
            </div>
          ))}
        </div>
      </>
    );
  }

  // 数据为空
  if (!linksLoading && links.length === 0) {
    return (
      <>
        <div className="mb-6">
          <div className="flex items-center gap-2.5">
            <Home className="h-6 w-6 text-slate-800 dark:text-white" />
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white"
              style={{ fontFamily: "var(--font-space-grotesk)" }}>
              全部书签
            </h2>
          </div>
        </div>
        <div className="max-w-md mx-auto text-center py-16">
          <div className="text-5xl mb-4">📭</div>
          <p className="text-slate-600 dark:text-slate-300 mb-2">还没有书签</p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mb-4">登录后可以添加和管理书签</p>
          <a
            href="/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/25"
          >
            前往登录 →
          </a>
        </div>
      </>
    );
  }

  // 有数据 → 展示
  return (
    <>
      <div className="mb-6">
        <div className="flex items-center gap-2.5">
          <Home className="h-6 w-6 text-slate-800 dark:text-white" />
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white"
            style={{ fontFamily: "var(--font-space-grotesk)" }}>
            全部书签
            <span className="ml-1.5 text-sm font-normal text-slate-400 dark:text-slate-500">
              ({displayCount})
            </span>
          </h2>
        </div>
      </div>
      <LinksGrid links={links} categories={categories} isAdmin={isAdmin} />
      {/* 无限滚动哨兵 */}
      <div ref={sentinelRef} className="flex justify-center py-6">
        {isLoadingMore && (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        )}
      </div>
    </>
  );
}
