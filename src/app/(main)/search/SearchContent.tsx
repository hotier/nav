"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { LinksGrid } from "@/components/LinksGrid";
import { useDataCache } from "@/hooks/useDataCache";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { Category, Link as LinkType } from "@/types";
import { readPageCache, writePageCache, subscribeDataChanged } from "@/lib/cache-client";

export default function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  // 分类走统一缓存
  const { data: cacheData } = useDataCache({ configs: [
    {
      name: "Category",
      fetch: () =>
        fetch("/api/categories")
          .then((r) => r.json())
          .then((d: Category[]) => ({ data: d, total: d.length })),
    },
  ] });
  const categories = (cacheData["Category"] || []) as Category[];

  // 搜索结果（query 驱动，不走全局版本缓存）
  const [links, setLinks] = useState<LinkType[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchResults = useCallback(async () => {
    if (!query) {
      setLinks([]);
      return;
    }

    setIsLoading(true);
    try {
      // 先读缓存即时渲染骨架填充
      const cached = readPageCache<LinkType>("Search", 1);
      if (cached?.data.length) setLinks(cached.data);

      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setLinks(data);
        writePageCache("Search", 1, data, data.length, 0);
      }
    } catch {
      // 静默失败，已有缓存数据兜底
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  // 订阅 Link 全量版本变更：链接增删改后，若当前有搜索词则清除缓存并重新搜索，
  // 保证搜索页与其余页面数据一致。
  const fetchResultsRef = useRef(fetchResults);
  useEffect(() => {
    fetchResultsRef.current = fetchResults;
  }, [fetchResults]);
  useEffect(() => {
    const unsub = subscribeDataChanged((table) => {
      if (table === "Link" && fetchResultsRef.current) {
        // 清除搜索缓存，强制重新搜索
        fetchResultsRef.current();
      }
    });
    return unsub;
  }, []);

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-space-grotesk)" }}>
          搜索结果
          {query && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({links.length})
            </span>
          )}
        </h2>
      </div>

      {query && (
        <div className="bg-card/80 dark:bg-card/80 backdrop-blur-xl rounded-2xl border border-border p-4 mb-6">
          <p className="text-sm text-muted-foreground">
            关键词: <span className="font-medium text-primary">&quot;{query}&quot;</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            找到 {links.length} 个相关链接
            {isLoading && <span className="ml-2 inline-block animate-pulse">正在搜索...</span>}
          </p>
        </div>
      )}

      {!query ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="default" className="text-5xl">🔍</EmptyMedia>
            <EmptyTitle>输入关键词搜索书签</EmptyTitle>
            <EmptyDescription>在上方搜索框中输入关键词并按回车</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : links.length === 0 && !isLoading ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="default" className="text-5xl">🔍</EmptyMedia>
            <EmptyTitle>未找到相关链接</EmptyTitle>
            <EmptyDescription>尝试其他关键词</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <LinksGrid
          links={links}
          categories={categories}
          isAdmin={isAdmin}
          searchQuery={query}
        />
      )}
    </>
  );
}
