import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCategories, getCategoryBySlug, getLinksByCategory } from "@/lib/queries";
import { LinksGrid } from "@/components/LinksGrid";
import { DynamicIcon } from "@/components/DynamicIcon";
import type { Category, Link as LinkType } from "@/types";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const session = await auth();
  const userId = session?.user?.id;

  const [category, categories] = await Promise.all([
    getCategoryBySlug(slug),
    getCategories(),
  ]);

  if (!category) notFound();

  const links = await getLinksByCategory(category.id, userId);

  const categoriesData = categories as unknown as Category[];
  const linksData = links as unknown as LinkType[];

  const CategoryIcon = ({ icon }: { icon?: string | null }) => {
    if (!icon) return null;
    return (
      <span className="inline-block mr-2 align-middle">
        <DynamicIcon name={icon} className="h-6 w-6" />
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h2
          className="text-2xl font-bold text-slate-800 dark:text-white"
          style={{ fontFamily: "var(--font-space-grotesk)" }}
        >
          <CategoryIcon icon={category.icon} />
          {category.name}
          <span className="ml-2 text-sm font-normal text-slate-400 dark:text-slate-500">
            ({linksData.length})
          </span>
        </h2>
      </div>

      {linksData.length === 0 ? (
        <div className="max-w-md mx-auto text-center py-16">
          <div className="text-5xl mb-4">📭</div>
          <p className="text-slate-600 dark:text-slate-300 mb-2">该分类下没有链接</p>
        </div>
      ) : (
        <LinksGrid
          links={linksData}
          categories={categoriesData}
          isAdmin={!!session?.user}
        />
      )}

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
