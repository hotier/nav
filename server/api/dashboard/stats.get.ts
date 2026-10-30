import { and, count, countDistinct, eq } from "drizzle-orm";
import { getDb } from "~~/server/utils/db";
import { requireSession } from "~~/server/utils/session";
import { swr } from "~~/server/utils/cache";
import { buildStatsWhere } from "~~/server/utils/permissions";
import { getTableVersion } from "~~/server/utils/queries";
import { dashboardStatsKey } from "~~/server/utils/cache-keys";
import { defineApiHandler } from "~~/server/utils/api";
import { links } from "~~/server/database/schema";

const TTL = 30_000;

export default defineApiHandler(async (event) => {
  const session = await requireSession(event);
  const userId = session.user.id;
  const userRole = session.user.role ?? undefined;

  const version = await getTableVersion("DashboardStats");
  const cacheKey = dashboardStatsKey(version, userId);

  return swr(
    cacheKey,
    async () => {
      // 管理员看全量，普通用户只看自己的；isPrivate 二分保证 total = public + private
      const linkWhere = buildStatsWhere("manage", userId, userRole);
      const db = getDb();
      const [totalLinks, categoryCount, publicLinks, privateLinks] = await Promise.all([
        db.select({ value: count() }).from(links).where(linkWhere),
        db
          .select({ value: countDistinct(links.categoryId) })
          .from(links)
          .where(linkWhere),
        db
          .select({ value: count() })
          .from(links)
          .where(and(linkWhere, eq(links.isPrivate, false))),
        db
          .select({ value: count() })
          .from(links)
          .where(and(linkWhere, eq(links.isPrivate, true))),
      ]);
      return {
        totalLinks: Number(totalLinks[0]?.value ?? 0),
        totalCategories: Number(categoryCount[0]?.value ?? 0),
        publicLinks: Number(publicLinks[0]?.value ?? 0),
        privateLinks: Number(privateLinks[0]?.value ?? 0),
      };
    },
    TTL,
  );
});
