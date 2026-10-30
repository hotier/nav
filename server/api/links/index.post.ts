import { and, eq, max } from "drizzle-orm";
import { getDb, getDbPool, isUniqueViolation } from "~~/server/utils/db";
import { requireSession } from "~~/server/utils/session";
import { createLinkSchema } from "~~/server/utils/validators";
import { incrementTableVersion } from "~~/server/utils/queries";
import { assertCanAddLinkToCategory } from "~~/server/utils/permissions";
import { cleanUrl, linkUrlKey } from "~~/server/utils/recognize-url";
import { probeImageUrl } from "~~/server/utils/probe-image";
import { defineApiHandler, fail } from "~~/server/utils/api";
import { categories, links } from "~~/server/database/schema";

export default defineApiHandler(async (event) => {
  const session = await requireSession(event);

  const result = createLinkSchema.safeParse(await readBody(event));
  if (!result.success) {
    return fail(event, 400, result.error.errors[0]?.message || "参数错误");
  }

  result.data.url = cleanUrl(result.data.url);

  // 图标校验：打不开 / 非图片 / 尺寸过小 → 清空图标，前端显示默认图标，不阻塞保存
  if (result.data.favicon) {
    const probe = await probeImageUrl(result.data.favicon);
    if (!probe.ok) {
      console.warn(`[favicon] 链接图标无效已忽略（${probe.reason}）: ${result.data.favicon}`);
      result.data.favicon = "";
    }
  }

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

  const userId = session.user.id;
  const urlKey = linkUrlKey(result.data.url);

  // 先查一次给出友好提示；并发兜底是 DB 唯一约束（userId + urlKey）
  const [urlConflict] = await getDb()
    .select({ id: links.id })
    .from(links)
    .where(and(eq(links.userId, userId), eq(links.urlKey, urlKey)))
    .limit(1);
  if (urlConflict) return fail(event, 409, "该链接已存在");

  try {
    // 数据写入 + 版本号递增同事务
    const link = await getDbPool().transaction(async (tx) => {
      const [aggregate] = await tx
        .select({ value: max(links.sortOrder) })
        .from(links)
        .where(eq(links.userId, userId));
      const [created] = await tx
        .insert(links)
        .values({
          ...result.data,
          urlKey,
          sortOrder: (aggregate?.value ?? -1) + 1,
          userId,
        })
        .returning();
      await incrementTableVersion("Link", tx);
      return created;
    });

    setResponseStatus(event, 201);
    return link;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail(event, 409, "该链接已存在");
    }
    throw error;
  }
});
