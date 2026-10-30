import { count, desc } from "drizzle-orm";
import { getDb } from "~~/server/utils/db";
import { requireSession } from "~~/server/utils/session";
import { adminOnly } from "~~/server/utils/permissions";
import { defineApiHandler } from "~~/server/utils/api";
import { links, users } from "~~/server/database/schema";

// 用户列表 / 新建账号为 admin 专用低频接口，直查 DB 不缓存
// （管理操作频率极低，缓存收益可忽略；省去版本化/失效的维护成本）

export default defineApiHandler(async (event) => {
  const session = await requireSession(event);
  adminOnly(session);

  const db = getDb();
  const [rows, counts] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        username: users.username,
        image: users.image,
        role: users.role,
        isSystemAdmin: users.isSystemAdmin,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt)),
    db.select({ userId: links.userId, value: count() }).from(links).groupBy(links.userId),
  ]);

  const countMap = new Map(counts.map((c) => [c.userId, Number(c.value)]));
  return rows.map((user) => ({ ...user, _count: { links: countMap.get(user.id) ?? 0 } }));
});
