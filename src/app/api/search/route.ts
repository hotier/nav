import { NextResponse, NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchSchema } from "@/lib/validators";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    const query = request.nextUrl.searchParams.get("q") || "";

    if (!query.trim()) {
      return NextResponse.json([], { status: 200 });
    }

    const links = await prisma.link.findMany({
      where: {
        AND: [
          // 可见性：登录后看自己的全部 + 别人公开（且所属分类也公开）；未登录只看公开+分类公开
          userId
            ? { OR: [{ userId }, { isPrivate: false, category: { isPublic: true } }] }
            : { isPrivate: false, category: { isPublic: true } },
          // 文本搜索
          {
            OR: [
              { title: { contains: query } },
              { description: { contains: query } },
              { url: { contains: query } },
            ],
          },
        ],
      },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }],
      take: 50,
    });

    // Scoring for sorted results
    const q = query.toLowerCase();
    const scored = links
      .map((link) => {
        let score = 0;
        if (link.title.toLowerCase().includes(q)) score += 3;
        if (link.url.toLowerCase().includes(q)) score += 2;
        if (link.description?.toLowerCase().includes(q)) score += 1;
        return { link, score };
      })
      .sort((a, b) => {
        if (a.link.isPinned !== b.link.isPinned) return a.link.isPinned ? -1 : 1;
        return b.score - a.score || a.link.sortOrder - b.link.sortOrder;
      });

    return NextResponse.json(scored.map((s) => s.link));
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

    const links = await prisma.link.findMany({
      where: {
        userId: session.user.id,
        OR: [
          { title: { contains: query } },
          { description: { contains: query } },
          { url: { contains: query } },
        ],
      },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }],
      take: 50,
    });

    const categories = await prisma.category.findMany({
      where: {
        name: { contains: query },
      },
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
