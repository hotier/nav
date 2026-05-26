import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { swr } from "@/lib/cache";
import { buildStatsWhere } from "@/lib/permissions";

const TTL = 30_000; // 30s TTL

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const userId = session.user.id;
  const userRole = (session.user as { role?: string }).role;
  const cacheKey = `dashboard:stats:${userId}`;

  const stats = await swr(cacheKey, async () => {
    // 管理后台统计算法：管理员看全量，普通用户只看自己的
    const linkWhere = buildStatsWhere("manage", userId, userRole);

    const [totalLinks, categoryCount, publicLinks, privateLinks] = await Promise.all([
      prisma.link.count({ where: linkWhere }),
      prisma.category.count({ where: { links: { some: linkWhere } } }),
      prisma.link.count({ where: { userId, isPrivate: false } }),
      prisma.link.count({ where: { userId, isPrivate: true } }),
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
