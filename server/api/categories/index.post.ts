import { and, eq } from "drizzle-orm";
import { getDb, getDbPool } from "~~/server/utils/db";
import { requireSession } from "~~/server/utils/session";
import { createCategorySchema } from "~~/server/utils/validators";
import { generateSlug } from "~~/server/utils/slug";
import { incrementTableVersion } from "~~/server/utils/queries";
import { defineApiHandler, fail } from "~~/server/utils/api";
import { categories } from "~~/server/database/schema";

export default defineApiHandler(async (event) => {
  const session = await requireSession(event);

  const result = createCategorySchema.safeParse(await readBody(event));
  if (!result.success) {
    return fail(event, 400, result.error.errors[0]?.message || "参数错误");
  }

  // 所有登录用户均可创建公开分类（弹窗提供「公开分类」开关）
  const isPublic = result.data.isPublic ?? false;

  // 公开分类名称全局唯一（公开与私有之间允许重名）
  if (isPublic) {
    const [dup] = await getDb()
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.isPublic, true), eq(categories.name, result.data.name.trim())))
      .limit(1);
    if (dup) return fail(event, 400, "已存在同名公开分类，请修改分类命名后重试");
  }

  let slug = generateSlug();
  while (
    (
      await getDb().select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).limit(1)
    ).length
  ) {
    slug = generateSlug();
  }

  // 数据写入 + 版本号递增同事务（联动递增 Link 版本）
  const category = await getDbPool().transaction(async (tx) => {
    const [created] = await tx
      .insert(categories)
      .values({
        name: result.data.name,
        icon: result.data.icon,
        parentId: result.data.parentId,
        sortOrder: result.data.sortOrder ?? 0,
        slug,
        isPublic,
        userId: session.user.id,
      })
      .returning();
    await incrementTableVersion("Category", tx);
    return created;
  });

  setResponseStatus(event, 201);
  return category;
});
