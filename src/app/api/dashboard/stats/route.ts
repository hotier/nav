import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { swr } from "@/lib/cache";

const TTL = 30_000; // 30s TTL

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const userId = session.user.id;
  const cacheKey = `dashboard:stats:${userId}`;

  const stats = await swr(cacheKey, async () => {
    const [links, categories] = await Promise.all([
      prisma.link.findMany({
        where: { userId },
        select: { isPrivate: true },
      }),
      prisma.category.findMany({
        select: { id: true },
      }),
    ]);

    return {
      totalLinks: links.length,
      totalCategories: categories.length,
      publicLinks: links.filter((l) => !l.isPrivate).length,
      privateLinks: links.filter((l) => l.isPrivate).length,
    };
  }, TTL);

  return NextResponse.json(stats);
}
