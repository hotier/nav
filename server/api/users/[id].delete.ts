import { count, eq } from "drizzle-orm";
import { getDb, getDbPool } from "~~/server/utils/db";
import { requireSession } from "~~/server/utils/session";
import { adminOnly } from "~~/server/utils/permissions";
import { incrementTableVersion } from "~~/server/utils/queries";
import { deleteUserAuthCache } from "~~/server/utils/user-cache";
import { defineApiHandler, fail } from "~~/server/utils/api";
import { users } from "~~/server/database/schema";

/** 删除用户（仅管理员） */
export default defineApiHandler(async (event) => {
  const session = await requireSession(event);
  adminOnly(session);

  const id = getRouterParam(event, "id");
  if (!id) return fail(event, 404, "用户不存在");

  const db = getDb();
  const [user] = await db
    .select({ id: users.id, role: users.role, isSystemAdmin: users.isSystemAdmin })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user) return fail(event, 404, "用户不存在");

  // 系统级管理员（项目初始化账号）不可删除
  if (user.isSystemAdmin) {
    return fail(event, 400, "系统级管理员不可删除");
  }

  // 不允许删除最后一个管理员
  if (user.role === "admin") {
    const [admins] = await db.select({ value: count() }).from(users).where(eq(users.role, "admin"));
    if (Number(admins?.value ?? 0) <= 1) {
      return fail(event, 400, "不能删除唯一的管理员，请先将其他用户设为管理员");
    }
  }

  // 删用户会级联删其链接/分类 → 数据写入与版本号递增同事务
  await getDbPool().transaction(async (tx) => {
    await tx.delete(users).where(eq(users.id, id));
    await incrementTableVersion("User", tx);
  });

  // 清除认证缓存：该用户旧 token 立即失效，无需等 Redis TTL
  await deleteUserAuthCache(id);

  return { success: true };
});
