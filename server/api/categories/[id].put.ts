import { and, eq, ne } from "drizzle-orm";
import { getDb, getDbPool } from "~~/server/utils/db";
import { requireSession } from "~~/server/utils/session";
import { updateCategorySchema } from "~~/server/utils/validators";
import { incrementTableVersion } from "~~/server/utils/queries";
import { assertCanManageCategory } from "~~/server/utils/permissions";
import { defineApiHandler, fail } from "~~/server/utils/api";
import { categories } from "~~/server/database/schema";

export default defineApiHandler(async (event) => {
  const session = await requireSession(event);
  const id = getRouterParam(event, "id");
  if (!id) return fail(event, 400, "缺少分类 ID");
  const isAdmin = session.user.role === "admin";

  const [existing] = await getDb()
    .select({
      id: categories.id,
      userId: categories.userId,
      isPublic: categories.isPublic,
      isHidden: categories.isHidden,
      name: categories.name,
    })
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);
  if (!existing) return fail(event, 404, "分类不存在");

  assertCanManageCategory(session, existing);

  if (existing.isHidden && !isAdmin) {
    return fail(event, 403, "该分类已被管理员隐藏，无权操作");
  }

  const result = updateCategorySchema.safeParse(await readBody(event));
  if (!result.success) {
    return fail(event, 400, result.error.errors[0]?.message || "参数错误");
  }

  const updateData: Partial<typeof categories.$inferInsert> = { ...result.data };

  if ("isHidden" in updateData && !isAdmin) {
    return fail(event, 403, "无权设置隐藏状态");
  }
  // 隐藏仅对公开内容施加（隐藏分类时强制保持公开）
  if (updateData.isHidden === true) updateData.isPublic = true;

  // 公开分类名称全局唯一（覆盖改名、私有改公开、解除隐藏等场景）
  const finalIsPublic =
    typeof updateData.isPublic === "boolean" ? updateData.isPublic : existing.isPublic;
  if (finalIsPublic) {
    const finalName = typeof updateData.name === "string" ? updateData.name : existing.name;
    const [dup] = await getDb()
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          ne(categories.id, id),
          eq(categories.isPublic, true),
          eq(categories.name, finalName.trim()),
        ),
      )
      .limit(1);
    if (dup) return fail(event, 400, "已存在同名公开分类，请修改分类命名后重试");
  }

  // 数据写入 + 版本号递增同事务
  return getDbPool().transaction(async (tx) => {
    const [updated] = await tx
      .update(categories)
      .set(updateData)
      .where(eq(categories.id, id))
      .returning();
    await incrementTableVersion("Category", tx);
    return updated;
  });
});
