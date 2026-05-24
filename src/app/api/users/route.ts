import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { swr } from "@/lib/cache";

const CACHE_KEY = "users:all";
const CACHE_TTL = 60_000; // 1min

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "无权限访问" }, { status: 403 });
  }

  const users = await swr(
    CACHE_KEY,
    () =>
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          image: true,
          role: true,
          createdAt: true,
          _count: { select: { links: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    CACHE_TTL
  );

  return NextResponse.json(users);
}
