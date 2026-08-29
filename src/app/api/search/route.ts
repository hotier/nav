import { NextResponse, NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchSchema } from "@/lib/validators";
import {
  buildSearchWhere,
  scoreAndSort,
  searchLinks as searchLinksFromModule,
} from "@/lib/search";
import { buildCategoryWhere } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    const userRole = (session?.user as { role?: string } | undefined)?.role;
    const query = request.nextUrl.searchParams.get("q") || "";

    if (!query.trim()) {
      return NextResponse.json([], { status: 200 });
    }

    // 可见性 + 文本匹配统一走 lib/search.ts（与 queries.searchLinks 同源）
    const where = buildSearchWhere(userId, userRole, query);
    const links = await prisma.link.findMany({
      where,
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }],
    });

    // 打分排序统一走 lib/search.ts（纯函数）
    const scored = scoreAndSort(links, query);

    return NextResponse.json(scored.slice(0, 50));
  } catch (error) {
    console.error("Failed to search:", error);
    return NextResponse.json(
      { error: "搜索失败" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const json = await request.json();
    const result = searchSchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    const { query } = result.data;
    const userRole = (session.user as { role?: string }).role;

    // 链接搜索统一走 lib/search.ts（含当前用户可见性，管理员含被隐藏内容）
    const links = await searchLinksFromModule(query, session.user.id, userRole);

    // 分类搜索：复用分类权限真源（未登录/普通用户搜不到他人私有分类名），并只返回安全字段
    const categories = await prisma.category.findMany({
      where: {
        AND: [
          buildCategoryWhere(session.user.id, "home", userRole) as Record<string, unknown>,
          { name: { contains: query } },
        ],
      },
      select: { id: true, name: true, icon: true },
      take: 10,
    });

    return NextResponse.json({ links, categories });
  } catch (error) {
    console.error("Failed to search:", error);
    return NextResponse.json(
      { error: "搜索失败" },
      { status: 500 }
    );
  }
}
