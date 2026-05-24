import { Suspense } from "react";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCategoryBySlug, getLinksByCategory } from "@/lib/queries";
import { LinksGrid } from "@/components/LinksGrid";
import { DynamicIcon } from "@/components/DynamicIcon";
import type { Category, Link as LinkType } from "@/types";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

// ────────────────── 链接区域（异步流式渲染）──────────────────
async function CategoryContent({
  categoryId,
  userId,
  isAdmin,
}: {
  categoryId: string;
  userId?: string;
  isAdmin: boolean;
}) {
  const links = await getLinksByCategory(categoryId, userId);
  const linksData = links as unknown as LinkType[];

  if (linksData.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-5xl mb-4">📭</div>
        <p className="text-slate-600 dark:text-slate-300 mb-2">该分类下没有链接</p>
      </div>
    );
  }

  return (
    <LinksGrid
      links={linksData}
      categories={[]}
      isAdmin={isAdmin}
    />
  );
}

function LinksSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 animate-pulse">
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
  );
}

// ────────────────── 主页面（Shell 立即渲染，内容流式进入）──────────────────
export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const session = await auth();
  const userId = session?.user?.id;

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const linkCount = (category._count as { links?: number })?.links ?? 0;

  return (
    <div className="space-y-6">
      {/* ── Shell：标题 + 统计数，立即渲染 ── */}
      <div className="flex items-center justify-between mb-4">
        <h2
          className="text-2xl font-bold text-slate-800 dark:text-white"
          style={{ fontFamily: "var(--font-space-grotesk)" }}
        >
          {category.icon && (
            <span className="inline-block mr-2 align-middle">
              <DynamicIcon name={category.icon} className="h-6 w-6" />
            </span>
          )}
          {category.name}
          <span className="ml-2 text-sm font-normal text-slate-400 dark:text-slate-500">
            ({linkCount})
          </span>
        </h2>
      </div>

      {/* ── 链接内容：Suspense 流式加载 ── */}
      <Suspense fallback={<LinksSkeleton />}>
        <CategoryContent
          categoryId={category.id}
          userId={userId}
          isAdmin={session?.user?.role === "admin"}
        />
      </Suspense>

      {/* ── 子分类（已在 getCategoryBySlug 中包含，立即渲染）── */}
      {category.children && category.children.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-4">子分类</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {category.children.map((child: Category) => (
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
