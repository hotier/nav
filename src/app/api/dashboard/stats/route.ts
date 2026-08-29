import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { swr } from "@/lib/cache";
import { buildStatsWhere } from "@/lib/permissions";
import { getTableVersion } from "@/lib/queries";
import { dashboardStatsKey } from "@/lib/cache-keys";

const TTL = 30_000; // 30s TTL（正确性由版本键保证，TTL 只是兜底）

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const userId = session.user.id;
  const userRole = (session.user as { role?: string }).role;

  // 版本化缓存键：Link/Category/User 写操作联动递增 DashboardStats 版本
  const version = await getTableVersion("DashboardStats");
  const cacheKey = dashboardStatsKey(version, userId);

  const stats = await swr(cacheKey, async () => {
    // 管理后台统计算法：管理员看全量，普通用户只看自己的
    // 口径统一：totalLinks / publicLinks / privateLinks 全部基于同一可见性规则
    //（isPrivate 二分，保证 total = public + private 恒成立）
    const linkWhere = buildStatsWhere("manage", userId, userRole);

    const [totalLinks, categoryCount, publicLinks, privateLinks] = await Promise.all([
      prisma.link.count({ where: linkWhere }),
      prisma.category.count({ where: { links: { some: linkWhere } } }),
      prisma.link.count({ where: { ...linkWhere, isPrivate: false } }),
      prisma.link.count({ where: { ...linkWhere, isPrivate: true } }),
    ]);

    return {
      totalLinks,
      totalCategories: categoryCount,
      publicLinks,
      privateLinks,
    };
  }, TTL);

  return NextResponse.json(stats);
}
