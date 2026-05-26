"use client";

import { LinksGrid } from "@/components/LinksGrid";
import { DynamicIcon } from "@/components/DynamicIcon";
import { useDataCache } from "@/hooks/useDataCache";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import type { Link as LinkType, Category } from "@/types";
import { Loader2 } from "lucide-react";

/** 从分类树（含 children 嵌套）中按 slug 查找分类 */
function findCategoryBySlug(slug: string, categories: Category[]): Category | undefined {
  for (const cat of categories) {
    if (cat.slug === slug) return cat;
    if (cat.children?.length) {
      const found = findCategoryBySlug(slug, cat.children as Category[]);
      if (found) return found;
    }
  }
  return undefined;
}

interface Props {
  slug: string;
  isAdmin: boolean;
}

export function CategoryContentClient({ slug, isAdmin }: Props) {
  const { data: catData, loading: catLoading } = useDataCache({ configs: [
    {
      name: "Category",
      fetch: () =>
        fetch("/api/categories")
          .then((r) => r.json())
          .then((d: Category[]) => ({ data: d, total: d.length })),
    },
  ] });

  const { items: allLinks, loading: linksLoading, isLoadingMore, sentinelRef } = useInfiniteScroll<LinkType>({
    name: "Link",
    autoPageSize: { cardHeight: 140, columns: () => {
      const w = window.innerWidth;
      if (w >= 1536) return 5;
      if (w >= 1280) return 4;
      if (w >= 1024) return 3;
      if (w >= 640) return 2;
      return 1;
    }},
    fetchFn: (page, pageSize) =>
      fetch(`/api/links?includePrivate=true&page=${page}&pageSize=${pageSize}`)
        .then((r) => r.json())
        .then((d: { data: LinkType[]; total: number }) => ({ data: d.data, total: d.total })),
  });

  const categories = (catData["Category"] || []) as Category[];

  const category = findCategoryBySlug(slug, categories);
  const categoryId = category?.id;
  const linkCount = (category?._count as { links?: number })?.links ?? 0;

  const filteredLinks = categoryId
    ? allLinks.filter((l) => l.categoryId === categoryId)
    : [];

  // 加载中 → 骨架
  if ((linksLoading || catLoading) && categories.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-muted animate-pulse" />
            <div className="h-7 w-24 rounded bg-muted animate-pulse" />
            <div className="h-5 w-8 rounded bg-muted animate-pulse" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 space-y-3 animate-pulse">
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
      </div>
    );
  }

  // 缓存命中但 slug 无匹配 → 404
  if (categories.length > 0 && !category) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-5xl mb-4">🔍</div>
        <p className="text-slate-600 dark:text-slate-300 mb-2">分类不存在</p>
      </div>
    );
  }

  // 缓存命中：找到匹配分类 → 直接渲染
  if (category && categories.length > 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-2xl font-bold text-slate-800 dark:text-white"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            {category?.icon && (
              <span className="inline-block mr-2 align-middle">
                <DynamicIcon name={category.icon} className="h-6 w-6" />
              </span>
            )}
            {category?.name || ""}
            <span className="ml-2 text-sm font-normal text-slate-400 dark:text-slate-500">
              ({linkCount})
            </span>
          </h2>
        </div>

        {filteredLinks.length > 0 ? (
          <>
            <LinksGrid links={filteredLinks} categories={categories} isAdmin={isAdmin} />
            {/* 无限滚动哨兵 */}
            <div ref={sentinelRef} className="flex justify-center py-6">
              {isLoadingMore && (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              )}
            </div>
          </>
        ) : (
          <div className="max-w-md mx-auto text-center py-16">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-slate-600 dark:text-slate-300 mb-2">该分类下没有链接</p>
          </div>
        )}

        {category?.children && category.children.length > 0 && (
          <div className="mt-8">
            <h3 className="text-lg font-semibold mb-4">子分类</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(category.children as Category[]).map((child) => (
                <a
                  key={child.id}
                  href={`/category/${child.slug || child.id}`}
                  className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
                >
                  <span className="text-2xl">📁</span>
                  <div>
                    <p className="font-medium">{child.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {child._count?.links || 0} 个链接
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 数据为空
  return null;
}
