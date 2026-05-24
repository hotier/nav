import { auth } from "@/lib/auth";
import { getCategories, getAllLinks } from "@/lib/queries";
import { LinksGrid } from "@/components/LinksGrid";
import type { Category, Link as LinkType } from "@/types";

export async function HomeContent() {
  const session = await auth();
  const userId = session?.user?.id;

  const [categoriesRaw, allLinks] = await Promise.all([
    getCategories(),
    getAllLinks(userId),
  ]);

  const categories = categoriesRaw as unknown as Category[];
  const linksData = allLinks as unknown as LinkType[];

  if (linksData.length === 0) {
    return (
      <>
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white"
            style={{ fontFamily: "var(--font-space-grotesk)" }}>
            全部书签<span className="ml-1.5 text-sm font-normal text-slate-400 dark:text-slate-500">(0)</span>
          </h2>
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

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white"
          style={{ fontFamily: "var(--font-space-grotesk)" }}>
          全部书签<span className="ml-1.5 text-sm font-normal text-slate-400 dark:text-slate-500">({linksData.length})</span>
        </h2>
      </div>
      <LinksGrid
        links={linksData}
        categories={categories}
        isAdmin={session?.user?.role === "admin"}
      />
    </>
  );
}
