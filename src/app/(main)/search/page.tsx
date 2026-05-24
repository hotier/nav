import { auth } from "@/lib/auth";
import { getCategories, searchLinks } from "@/lib/queries";
import { LinksGrid } from "@/components/LinksGrid";
import type { Category, Link as LinkType } from "@/types";

interface SearchPageProps {
  searchParams: Promise<{ q?: string; ai?: string }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = params.q || "";
  const session = await auth();
  const userId = session?.user?.id;

  const [categories, results] = await Promise.all([
    getCategories(),
    searchLinks(query, userId),
  ]);

  const categoriesData = categories as unknown as Category[];
  const linksData = results as unknown as LinkType[];

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white" style={{ fontFamily: "var(--font-space-grotesk)" }}>
          搜索结果
          <span className="ml-2 text-sm font-normal text-slate-400 dark:text-slate-500">
            ({linksData.length})
          </span>
        </h2>
      </div>

      {query && (
        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-700/50 p-4 mb-6">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            关键词: <span className="font-medium text-blue-500">&quot;{query}&quot;</span>
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            找到 {linksData.length} 个相关链接
          </p>
        </div>
      )}

      {linksData.length === 0 ? (
        <div className="max-w-md mx-auto text-center py-16">
          <div className="text-5xl mb-4">🔍</div>
          <p className="text-slate-600 dark:text-slate-300 mb-2">未找到相关链接</p>
          <p className="text-sm text-slate-400 dark:text-slate-500">尝试其他关键词</p>
        </div>
      ) : (
        <LinksGrid
          links={linksData}
          categories={categoriesData}
          isAdmin={!!session?.user}
          searchQuery={query}
        />
      )}
    </>
  );
}
