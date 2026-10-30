import { and, asc, count, desc, eq, type SQL } from "drizzle-orm";
import { getDb } from "~~/server/utils/db";
import { getSession } from "~~/server/utils/session";
import { swr } from "~~/server/utils/cache";
import { getTableVersion } from "~~/server/utils/queries";
import { buildLinkWhere, type LinkViewScope } from "~~/server/utils/permissions";
import { linkListKey } from "~~/server/utils/cache-keys";
import { defineApiHandler } from "~~/server/utils/api";
import { categories, links, users } from "~~/server/database/schema";

export default defineApiHandler(async (event) => {
  const session = await getSession(event);
  const userId = session?.user?.id;
  const userRole = session?.user?.role ?? undefined;

  const q = getQuery(event);
  const categoryId = typeof q.categoryId === "string" ? q.categoryId : undefined;
  const page = parseInt(String(q.page || "1"), 10) || 1;
  const pageSize = parseInt(String(q.pageSize || "50"), 10) || 50;
  const skip = (page - 1) * pageSize;
  const scope: LinkViewScope = q.scope === "manage" ? "manage" : "home";
  const sort = typeof q.sort === "string" ? q.sort : "order"; // order | recent

  const conditions: Array<SQL | undefined> = [buildLinkWhere(scope, userId, userRole)];
  if (categoryId) conditions.push(eq(links.categoryId, categoryId));
  const where = and(...conditions);

  // 置顶始终优先，二序按 sort 切换；createdAt 作 tie-breaker
  const orderBy =
    sort === "recent"
      ? [desc(links.isPinned), desc(links.createdAt), asc(links.sortOrder)]
      : [desc(links.isPinned), asc(links.sortOrder), asc(links.createdAt)];

  const version = await getTableVersion("Link");
  const cacheKey = linkListKey(version, userId, scope, categoryId, page, sort);
  const result = await swr(
    cacheKey,
    async () => {
      const db = getDb();
      const [rows, totals] = await Promise.all([
        db
          .select({
            link: links,
            user: {
              id: users.id,
              name: users.name,
              username: users.username,
              image: users.image,
            },
            category: {
              id: categories.id,
              name: categories.name,
              icon: categories.icon,
            },
          })
          .from(links)
          .innerJoin(users, eq(links.userId, users.id))
          .innerJoin(categories, eq(links.categoryId, categories.id))
          .where(where)
          .orderBy(...orderBy)
          .offset(skip)
          .limit(pageSize),
        db.select({ value: count() }).from(links).where(where),
      ]);

      return {
        data: rows.map((row) => ({ ...row.link, user: row.user, category: row.category })),
        total: Number(totals[0]?.value ?? 0),
      };
    },
    30_000,
  );

  return result;
});
