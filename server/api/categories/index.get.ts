import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "~~/server/utils/db";
import { getSession } from "~~/server/utils/session";
import { swr } from "~~/server/utils/cache";
import { getTableVersion } from "~~/server/utils/queries";
import { buildCategoryWhere, buildLinkWhere, type LinkViewScope } from "~~/server/utils/permissions";
import { categoryKey } from "~~/server/utils/cache-keys";
import { defineApiHandler } from "~~/server/utils/api";
import { categories, links, users } from "~~/server/database/schema";

export default defineApiHandler(async (event) => {
  const session = await getSession(event);
  const userId = session?.user?.id;
  const userRole = session?.user?.role ?? undefined;

  const q = getQuery(event);
  const scope: LinkViewScope = q.scope === "manage" ? "manage" : "home";
  // forSelector=true 时跳过"有可见链接"过滤，用于分类选择器（空公开分类也能选）
  const forSelector = q.forSelector === "true";

  const categoryWhere = buildCategoryWhere(userId, scope, userRole);
  const linkWhere = buildLinkWhere(scope, userId, userRole);

  const version = await getTableVersion("Category");
  const cacheKey = categoryKey(version, userId, scope);
  return swr(
    cacheKey,
    async () => {
      const db = getDb();
      const rows = await db
        .select({
          category: categories,
          user: {
            id: users.id,
            name: users.name,
            username: users.username,
            image: users.image,
          },
        })
        .from(categories)
        .leftJoin(users, eq(categories.userId, users.id))
        .where(categoryWhere)
        .orderBy(asc(categories.sortOrder));

      // 首页：只展示有可见链接的分类；管理后台/选择器：展示所有
      let visibleIds: Set<string> | null = null;
      if (scope === "home" && linkWhere && !forSelector) {
        const groups = await db
          .selectDistinct({ categoryId: links.categoryId })
          .from(links)
          .where(linkWhere);
        visibleIds = new Set(groups.map((g) => g.categoryId));
      }

      const topRows = visibleIds
        ? rows.filter((row) => visibleIds!.has(row.category.id))
        : rows;

      // 链接按分类归组：子分类也要带 links，管理页/前台子分类都需要展示数量与条目
      const allIds = rows.map((row) => row.category.id);
      const linkRows = allIds.length
        ? await db
            .select()
            .from(links)
            .where(and(inArray(links.categoryId, allIds), linkWhere))
            .orderBy(desc(links.isPinned), asc(links.sortOrder), asc(links.createdAt))
        : [];

      const linksByCategory = new Map<string, typeof linkRows>();
      for (const link of linkRows) {
        const list = linksByCategory.get(link.categoryId);
        if (list) list.push(link);
        else linksByCategory.set(link.categoryId, [link]);
      }

      return topRows.map(({ category, user }) => ({
        ...category,
        user: user?.id ? user : null,
        children: rows
          .filter((child) => child.category.parentId === category.id)
          .map((child) => ({
            ...child.category,
            links: linksByCategory.get(child.category.id) ?? [],
          })),
        links: linksByCategory.get(category.id) ?? [],
      }));
    },
    60_000,
  );
});
