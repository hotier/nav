import { and, eq, ne } from "drizzle-orm";
import { getDb, getDbPool, isUniqueViolation } from "~~/server/utils/db";
import { requireSession } from "~~/server/utils/session";
import { updateLinkSchema } from "~~/server/utils/validators";
import { incrementTableVersion } from "~~/server/utils/queries";
import { assertCanAddLinkToCategory } from "~~/server/utils/permissions";
import { cleanUrl, linkUrlKey } from "~~/server/utils/recognize-url";
import { probeImageUrl } from "~~/server/utils/probe-image";
import { defineApiHandler, fail } from "~~/server/utils/api";
import { linkColumns } from "~~/server/database/link-columns";
import { categories, links } from "~~/server/database/schema";

export default defineApiHandler(async (event) => {
  const session = await requireSession(event);
  const id = getRouterParam(event, "id");
  if (!id) return fail(event, 400, "缺少链接 ID");

  const result = updateLinkSchema.safeParse(await readBody(event));
  if (!result.success) {
    return fail(event, 400, result.error.errors[0]?.message || "参数错误");
  }

  const isAdmin = session.user.role === "admin";

  const [existingRow] = await getDb()
    .select({ link: linkColumns, category: categories })
    .from(links)
    .innerJoin(categories, eq(links.categoryId, categories.id))
    .where(eq(links.id, id))
    .limit(1);
  if (!existingRow) return fail(event, 404, "链接不存在");
  const existing = { ...existingRow.link, category: existingRow.category };

  // 属主可编辑；管理员可编辑「公开分类下的公开链接」
  const isOwner = existing.userId === session.user.id;
  const isPublicLinkInPublicCat = existing.isPrivate === false && existing.category.isPublic;
  if (!isOwner && !(isAdmin && isPublicLinkInPublicCat)) {
    return fail(event, 403, "无权操作此链接");
  }
  if (existing.isHidden && !isAdmin) {
    return fail(event, 403, "该链接已被管理员隐藏，无权操作");
  }
  if (!isAdmin && "isHidden" in result.data) {
    return fail(event, 403, "无权设置隐藏状态");
  }
  // 管理员隐藏他人链接时强制保持公开
  if (isAdmin && result.data.isHidden === true && !isOwner) {
    result.data.isPrivate = false;
  }

  // 管理员编辑他人公开链接：禁止改为私有或移入私有分类
  if (!isOwner && isAdmin) {
    if (result.data.isPrivate === true) {
      return fail(event, 403, "无权将该链接设为私有");
    }
    if (result.data.categoryId && result.data.categoryId !== existing.categoryId) {
      const [targetCat] = await getDb()
        .select({ isPublic: categories.isPublic })
        .from(categories)
        .where(eq(categories.id, result.data.categoryId))
        .limit(1);
      if (!targetCat) return fail(event, 404, "目标分类不存在");
      if (!targetCat.isPublic) return fail(event, 403, "无权将该链接移入私有分类");
    }
  }

  if (result.data.categoryId) {
    const [category] = await getDb()
      .select({
        id: categories.id,
        userId: categories.userId,
        isPublic: categories.isPublic,
        isHidden: categories.isHidden,
      })
      .from(categories)
      .where(eq(categories.id, result.data.categoryId))
      .limit(1);
    if (!category) return fail(event, 404, "分类不存在");
    assertCanAddLinkToCategory(session, category);
  }

  if (result.data.url) result.data.url = cleanUrl(result.data.url);

  // 仅在 favicon 变化时探测；清空图标视为合法
  if ("favicon" in result.data && result.data.favicon && result.data.favicon !== existing.favicon) {
    const probe = await probeImageUrl(result.data.favicon);
    if (!probe.ok) {
      console.warn(`[favicon] 链接图标无效已忽略（${probe.reason}）: ${result.data.favicon}`);
      result.data.favicon = "";
    }
  }

  const data: Partial<typeof links.$inferInsert> = { ...result.data };
  if (result.data.url) {
    data.urlKey = linkUrlKey(result.data.url);
    // 同一用户内 URL 不得重复（按原属主查重，排除自身）
    const [urlConflict] = await getDb()
      .select({ id: links.id })
      .from(links)
      .where(and(eq(links.userId, existing.userId), eq(links.urlKey, data.urlKey), ne(links.id, id)))
      .limit(1);
    if (urlConflict) return fail(event, 409, "该链接已存在");
  }

  try {
    // 数据写入 + 版本号递增同事务
    const link = await getDbPool().transaction(async (tx) => {
      const [updated] = await tx.update(links).set(data).where(eq(links.id, id)).returning();
      await incrementTableVersion("Link", tx);
      return updated;
    });

    const [category] = await getDb()
      .select({ id: categories.id, name: categories.name, icon: categories.icon })
      .from(categories)
      .where(eq(categories.id, link.categoryId))
      .limit(1);
    return { ...link, category };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail(event, 409, "该链接已存在");
    }
    throw error;
  }
});
