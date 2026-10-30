import { and, eq, or, type SQL } from "drizzle-orm";
import { getDb } from "~~/server/utils/db";
import { requireSession } from "~~/server/utils/session";
import { defineApiHandler, fail } from "~~/server/utils/api";
import { categories, links } from "~~/server/database/schema";

export default defineApiHandler(async (event) => {
  const session = await requireSession(event);
  const id = getRouterParam(event, "id");
  if (!id) return fail(event, 400, "缺少链接 ID");

  const isAdmin = session.user.role === "admin";
  const visible: Array<SQL | undefined> = [
    // 普通用户看不到自己被隐藏的链接；管理员可见（管理/解除隐藏用）
    isAdmin
      ? eq(links.userId, session.user.id)
      : and(eq(links.userId, session.user.id), eq(links.isHidden, false)),
  ];
  // 管理员可查看其他用户的公开链接（前提：分类也公开，含被隐藏的）
  if (isAdmin) {
    visible.push(and(eq(links.isPrivate, false), eq(categories.isPublic, true)));
  }

  const [row] = await getDb()
    .select({ link: links, category: categories })
    .from(links)
    .innerJoin(categories, eq(links.categoryId, categories.id))
    .where(and(eq(links.id, id), or(...visible)))
    .limit(1);

  if (!row) return fail(event, 404, "链接不存在");
  return { ...row.link, category: row.category };
});
