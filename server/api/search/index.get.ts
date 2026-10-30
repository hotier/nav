import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "~~/server/utils/db";
import { getSession } from "~~/server/utils/session";
import { buildSearchWhere, scoreAndSort } from "~~/server/utils/search";
import { defineApiHandler } from "~~/server/utils/api";
import { categories, links } from "~~/server/database/schema";

export default defineApiHandler(async (event) => {
  const session = await getSession(event);
  const userId = session?.user?.id;
  const userRole = session?.user?.role ?? undefined;
  const query = String(getQuery(event).q || "");

  if (!query.trim()) return [];

  // 可见性 + 文本匹配统一走 server/utils/search.ts
  const rows = await getDb()
    .select({ link: links, category: { id: categories.id, name: categories.name } })
    .from(links)
    .innerJoin(categories, eq(links.categoryId, categories.id))
    .where(buildSearchWhere(userId, userRole, query))
    .orderBy(desc(links.isPinned), asc(links.sortOrder));

  return scoreAndSort(
    rows.map((row) => ({ ...row.link, category: row.category })),
    query,
  ).slice(0, 50);
});
