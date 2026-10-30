import { and, count, eq, ne, sql } from "drizzle-orm";
import { getDb, getDbPool } from "~~/server/utils/db";
import { requireSession } from "~~/server/utils/session";
import { incrementTableVersion } from "~~/server/utils/queries";
import { assertCanManageCategory } from "~~/server/utils/permissions";
import { defineApiHandler, fail } from "~~/server/utils/api";
import { categories, links } from "~~/server/database/schema";

export default defineApiHandler(async (event) => {
  const session = await requireSession(event);
  const id = getRouterParam(event, "id");
  if (!id) return fail(event, 400, "缺少分类 ID");

  const [existing] = await getDb()
    .select({
      id: categories.id,
      userId: categories.userId,
      isPublic: categories.isPublic,
      isHidden: categories.isHidden,
    })
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);
  if (!existing) return fail(event, 404, "分类不存在");

  assertCanManageCategory(session, existing);

  if (existing.isHidden && session.user.role !== "admin") {
    return fail(event, 403, "该分类已被管理员隐藏，无权删除");
  }

  // Link 的 onDelete: Cascade 会删除分类下所有链接（含他人的）。
  // 同一事务里锁住分类行（并发插入 Link 需要父行 FOR KEY SHARE，与 FOR UPDATE 互斥），
  // 统计他人链接数，>0 直接拒绝，避免静默销毁他人数据。
  const foreignLinks = await getDbPool().transaction(async (tx) => {
    await tx.execute(sql`SELECT "id" FROM "Category" WHERE "id" = ${id} FOR UPDATE`);

    const [others] = await tx
      .select({ value: count() })
      .from(links)
      .where(and(eq(links.categoryId, id), ne(links.userId, session.user.id)));
    const foreignCount = Number(others?.value ?? 0);
    if (foreignCount > 0) return foreignCount;

    await tx.delete(categories).where(eq(categories.id, id));
    await incrementTableVersion("Category", tx);
    return 0;
  });

  if (foreignLinks > 0) {
    setResponseStatus(event, 409);
    return {
      error: `该分类下有 ${foreignLinks} 个其他用户的链接，删除会一并丢失，已阻止；请先将这些链接移到其他分类`,
      code: "CATEGORY_HAS_FOREIGN_LINKS",
      foreignLinks,
    };
  }

  return { success: true };
});
