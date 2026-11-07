import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "~~/server/utils/db";
import { requireSession } from "~~/server/utils/session";
import { buildCategoryWhere, buildLinkWhere, type LinkViewScope } from "~~/server/utils/permissions";
import { defineApiHandler, fail } from "~~/server/utils/api";
import { linkColumns } from "~~/server/database/link-columns";
import { categories, links } from "~~/server/database/schema";

export default defineApiHandler(async (event) => {
  const session = await requireSession(event);
  const id = getRouterParam(event, "id");
  if (!id) return fail(event, 400, "缺少分类 ID");

  const scope: LinkViewScope = getQuery(event).scope === "manage" ? "manage" : "home";
  const categoryWhere = buildCategoryWhere(session.user.id, scope, session.user.role ?? undefined);
  const linkWhere = buildLinkWhere(scope, session.user.id, session.user.role ?? undefined);

  const db = getDb();
  const [category] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), categoryWhere))
    .limit(1);

  if (!category) return fail(event, 404, "分类不存在");

  const [children, categoryLinks] = await Promise.all([
    db
      .select()
      .from(categories)
      .where(and(eq(categories.parentId, id), categoryWhere))
      .orderBy(asc(categories.sortOrder)),
    db
      .select(linkColumns)
      .from(links)
      .where(and(eq(links.categoryId, id), linkWhere))
      .orderBy(desc(links.isPinned), asc(links.sortOrder), asc(links.createdAt)),
  ]);

  return { ...category, children, links: categoryLinks };
});
