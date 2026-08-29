import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 用户列表为 admin 专用低频接口，直查 DB 不缓存
// （管理操作频率极低，缓存收益可忽略；省去版本化/失效的维护成本）

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "无权限访问" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
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
  });

  return NextResponse.json(users);
}
