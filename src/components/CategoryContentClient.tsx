"use client";

import { LinksGrid } from "@/components/LinksGrid";
import { DynamicIcon } from "@/components/DynamicIcon";
import { CategorySkeleton } from "@/components/CategorySkeleton";
import { useDataCache } from "@/hooks/useDataCache";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useEffect, useState } from "react";
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
  userId: string | null;
  slug: string;
  isAdmin: boolean;
}

export function CategoryContentClient({ userId, slug, isAdmin }: Props) {
  // SSR 首帧必须与客户端水合首帧一致，避免 hydration mismatch：
  // 服务端 useDataCache 返回空数据，而客户端水合时可能读到缓存，导致渲染分支不一致。
  // 水合完成前统一走骨架，水合后再渲染真实数据。
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const { data: catData, loading: catLoading } = useDataCache({ configs: [
    {
      name: "Category",
      fetch: () =>
        fetch("/api/categories")
          .then((r) => r.json())
          .then((d: Category[] | { error?: string }) => ({
            // 防御：接口失败/返回错误时不崩溃，回退为空数组
            data: Array.isArray(d) ? d : [],
            total: Array.isArray(d) ? d.length : 0,
          })),
    },
  ], userId });

  const categories = Array.isArray(catData["Category"]) ? (catData["Category"] as Category[]) : [];

  const category = findCategoryBySlug(slug, categories);
  const categoryId = category?.id;
  const linkCount = (category?._count as { links?: number })?.links ?? 0;

  // 按分类分页查询：缓存名带 categoryId 维度，分类定位完成（slug→id）后才拉取该分类数据。
  // 不再全量拉取 + 客户端过滤，也不再传 includePrivate（可见性完全由后端 buildLinkWhere 决定）。
  const { items: categoryLinks, loading: linksLoading, isLoadingMore, sentinelRef } = useInfiniteScroll<LinkType>({
    name: categoryId ? `Link:category:${categoryId}` : "Link:category:pending",
    versionTable: "Link",
    userId,
    autoPageSize: { cardHeight: 140, columns: () => {
      const w = window.innerWidth;
      if (w >= 1536) return 5;
      if (w >= 1280) return 4;
      if (w >= 1024) return 3;
      if (w >= 640) return 2;
      return 1;
    }},
    fetchFn: (page, pageSize) =>
      fetch(`/api/links?categoryId=${categoryId ?? ""}&scope=home&sort=recent&page=${page}&pageSize=${pageSize}`)
        .then((r) => r.json())
        .then((d: { data: LinkType[]; total: number }) => ({ data: d.data, total: d.total })),
  });

  // 优先显示骨架：只要还在加载（未水合 / 链接加载中 / 分类加载中）就先展示骨架，
  // 确认无数据、失败或超时后才切换到空数据/内容。
  if (!isHydrated || linksLoading || (catLoading && categories.length === 0)) {
    return <CategorySkeleton />;
  }

  // 缓存命中但 slug 无匹配 → 404
  if (categories.length > 0 && !category) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="default" className="text-5xl">🔍</EmptyMedia>
          <EmptyTitle>分类不存在</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  // 缓存命中：找到匹配分类 → 直接渲染
  if (category && categories.length > 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-2xl font-bold text-foreground"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            {category?.icon && (
              <span className="inline-block mr-2 align-middle">
                <DynamicIcon name={category.icon} className="h-6 w-6" />
              </span>
            )}
            {category?.name || ""}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({linkCount})
            </span>
          </h2>
        </div>

        {categoryLinks.length > 0 ? (
          <>
            <LinksGrid links={categoryLinks} categories={categories} isAdmin={isAdmin} />
            {/* 无限滚动哨兵 */}
            <div ref={sentinelRef} className="flex justify-center py-6">
              {isLoadingMore && (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              )}
            </div>
          </>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="default" className="text-5xl">📭</EmptyMedia>
              <EmptyTitle>该分类下没有链接</EmptyTitle>
            </EmptyHeader>
          </Empty>
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
