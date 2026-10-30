import { eq } from "drizzle-orm";
import { getDb, getDbPool } from "~~/server/utils/db";
import { requireSession } from "~~/server/utils/session";
import { incrementTableVersion } from "~~/server/utils/queries";
import { defineApiHandler, fail } from "~~/server/utils/api";
import { categories, links } from "~~/server/database/schema";

export default defineApiHandler(async (event) => {
  const session = await requireSession(event);
  const id = getRouterParam(event, "id");
  if (!id) return fail(event, 400, "缺少链接 ID");

  const isAdmin = session.user.role === "admin";
  const [existing] = await getDb()
    .select({
      id: links.id,
      userId: links.userId,
      isPrivate: links.isPrivate,
      isHidden: links.isHidden,
      categoryId: links.categoryId,
      categoryIsPublic: categories.isPublic,
    })
    .from(links)
    .innerJoin(categories, eq(links.categoryId, categories.id))
    .where(eq(links.id, id))
    .limit(1);
  if (!existing) return fail(event, 404, "链接不存在");

  // 属主可删除；管理员可删除「公开分类下的公开链接」
  const isOwner = existing.userId === session.user.id;
  const isPublicLinkInPublicCat = existing.isPrivate === false && existing.categoryIsPublic;
  if (!isOwner && !(isAdmin && isPublicLinkInPublicCat)) {
    return fail(event, 403, "无权操作此链接");
  }
  if (existing.isHidden && !isAdmin) {
    return fail(event, 403, "该链接已被管理员隐藏，无权删除");
  }

  await getDbPool().transaction(async (tx) => {
    await tx.delete(links).where(eq(links.id, id));
    await incrementTableVersion("Link", tx);
  });

  return { success: true };
});
