"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { LinksGrid } from "@/components/LinksGrid";
import { useDataCache } from "@/hooks/useDataCache";
import type { Category, Link as LinkType } from "@/types";
import { readPageCache, writePageCache } from "@/lib/cache-client";

export default function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  // 分类走统一缓存
  const { data: cacheData } = useDataCache([
    {
      name: "Category",
      fetch: () =>
        fetch("/api/categories")
          .then((r) => r.json())
          .then((d: Category[]) => ({ data: d, total: d.length })),
    },
  ]);
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

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white" style={{ fontFamily: "var(--font-space-grotesk)" }}>
          搜索结果
          {query && (
            <span className="ml-2 text-sm font-normal text-slate-400 dark:text-slate-500">
              ({links.length})
            </span>
          )}
        </h2>
      </div>

      {query && (
        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-700/50 p-4 mb-6">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            关键词: <span className="font-medium text-blue-500">&quot;{query}&quot;</span>
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            找到 {links.length} 个相关链接
            {isLoading && <span className="ml-2 inline-block animate-pulse">正在搜索...</span>}
          </p>
        </div>
      )}

      {!query ? (
        <div className="max-w-md mx-auto text-center py-16">
          <div className="text-5xl mb-4">🔍</div>
          <p className="text-slate-600 dark:text-slate-300 mb-2">输入关键词搜索书签</p>
          <p className="text-sm text-slate-400 dark:text-slate-500">在上方搜索框中输入关键词并按回车</p>
        </div>
      ) : links.length === 0 && !isLoading ? (
        <div className="max-w-md mx-auto text-center py-16">
          <div className="text-5xl mb-4">🔍</div>
          <p className="text-slate-600 dark:text-slate-300 mb-2">未找到相关链接</p>
          <p className="text-sm text-slate-400 dark:text-slate-500">尝试其他关键词</p>
        </div>
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
