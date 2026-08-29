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
import { Loader2, FolderX, Inbox } from "lucide-react";

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
      name: "Category:v4",
      versionTable: "Category",
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

  const categories = Array.isArray(catData["Category:v4"]) ? (catData["Category:v4"] as Category[]) : [];

  const category = findCategoryBySlug(slug, categories);
  const categoryId = category?.id;

  // 全部链接数据（与首页共用 name="Link" —— 同一取数渠道/缓存/版本号）：
  // 分类页是全部页的分类视图，前端按 categoryId 过滤展示。
  // 任意页面（首页/分类页/后台）编辑链接后广播刷新，所有页面拉取同一份全量数据，天然同步。
  // enabled 门控：categoryId 未定位（分类树未加载完成）前禁止初始化/拉取/写缓存——
  // 否则会以错误参数拉取并污染缓存，参数就绪后旧数据还会泄漏到渲染（历史 bug）。
  const { items: allLinks, loading: linksLoading, isLoadingMore, sentinelRef } = useInfiniteScroll<LinkType>({
    name: "Link:v2",
    versionTable: "Link",
    enabled: !!categoryId,
    userId,
    pageSize: 1000,
    fetchFn: (page, pageSize) =>
      fetch(`/api/links?page=${page}&pageSize=${pageSize}&sort=recent`)
        .then((r) => r.json())
        .then((d: { data: LinkType[]; total: number }) => ({ data: d.data, total: d.total })),
  });

  // 前端过滤：本分类可见的链接（与后端 buildLinkWhere 同一可见性，全量数据里直接筛）
  const categoryLinks = (allLinks as LinkType[]).filter((l) => l.categoryId === categoryId);

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
          <EmptyMedia variant="default">
            <FolderX className="size-12 text-muted-foreground/50" />
          </EmptyMedia>
          <EmptyTitle>分类不存在</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  // 分类链接总数 = 全量数据中该分类过滤后的数量（与页面实际渲染一致）
  const displayCount = categoryLinks.length;

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
              ({displayCount})
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
              <EmptyMedia variant="default">
                <Inbox className="size-12 text-muted-foreground/50" />
              </EmptyMedia>
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
