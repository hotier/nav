import { count, eq } from "drizzle-orm";
import { getDb } from "~~/server/utils/db";
import { requireSession } from "~~/server/utils/session";
import { defineApiHandler, fail } from "~~/server/utils/api";
import { links, users } from "~~/server/database/schema";

export default defineApiHandler(async (event) => {
  const session = await requireSession(event);

  // 单行主键查询，不缓存（账号数据没有版本键）
  const db = getDb();
  const [[user], [linkCount]] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        username: users.username,
        image: users.image,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1),
    db.select({ value: count() }).from(links).where(eq(links.userId, session.user.id)),
  ]);
  if (!user) return fail(event, 404, "用户不存在");
  return { ...user, _count: { links: Number(linkCount?.value ?? 0) } };
});
