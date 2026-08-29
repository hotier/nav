"use client";

import { LinksGrid } from "@/components/LinksGrid";
import { CategorySkeleton } from "@/components/CategorySkeleton";
import { useDataCache } from "@/hooks/useDataCache";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useEffect, useState } from "react";
import type { Link as LinkType, Category } from "@/types";
import { Home, Loader2 } from "lucide-react";

interface Props {
  userId: string | null;
  linkCount: number;
  isAdmin: boolean;
}

export function HomeContentClient({ userId, linkCount, isAdmin }: Props) {
  // 避免 SSR 首帧与客户端水合首帧渲染不一致（客户端缓存 hooks 在两端数据不同）
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

  const { items: links, total, hasMore, isLoadingMore, loading: linksLoading, sentinelRef } = useInfiniteScroll<LinkType>({
    name: "Link",
    userId,
    // 全量加载（个人导航站数据量小）：与分类页共用同一份数据、缓存与版本号，
    // 分类页在前端按 categoryId 过滤。消除"多视图各自分页缓存 → 一处修改、别处不同步"的问题。
    pageSize: 1000,
    fetchFn: (page, pageSize) =>
      fetch(`/api/links?page=${page}&pageSize=${pageSize}&sort=recent`)
        .then((r) => r.json())
        .then((d: { data: LinkType[]; total: number }) => ({ data: d.data, total: d.total })),
  });

  const categories = Array.isArray(catData["Category"]) ? (catData["Category"] as Category[]) : [];
  const displayCount = linkCount || total || links.length;

  // 优先显示骨架：只要还在加载（未水合 / 链接加载中）就先展示骨架，
  // 确认无数据、失败或超时后才切换到空数据/内容。
  if (!isHydrated || linksLoading) {
    return <CategorySkeleton />;
  }

  // 数据为空
  if (!linksLoading && links.length === 0) {
    return (
      <>
        <div className="mb-6">
          <div className="flex items-center gap-2.5">
            <Home className="h-6 w-6 text-foreground" />
            <h2 className="text-2xl font-bold text-foreground"
              style={{ fontFamily: "var(--font-space-grotesk)" }}>
              全部书签
            </h2>
          </div>
        </div>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="default" className="text-5xl">📭</EmptyMedia>
            <EmptyTitle>还没有书签</EmptyTitle>
            <EmptyDescription>登录后可以添加和管理书签</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <a
              href="/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25"
            >
              前往登录 →
            </a>
          </EmptyContent>
        </Empty>
      </>
    );
  }

  // 有数据 → 展示
  return (
    <>
      <div className="mb-6">
        <div className="flex items-center gap-2.5">
          <Home className="h-6 w-6 text-foreground" />
          <h2 className="text-2xl font-bold text-foreground"
            style={{ fontFamily: "var(--font-space-grotesk)" }}>
            全部书签
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">
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
