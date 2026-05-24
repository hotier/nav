import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLinkSchema } from "@/lib/validators";
import { invalidateLinks } from "@/lib/queries";
import { swr } from "@/lib/cache";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");
    const includePrivate = searchParams.get("includePrivate") === "true";

    // SWR 缓存，前端页面和后台管理共用同一套查询
    const cacheKey = `links:api:${session.user.id}:${categoryId || "all"}:${includePrivate ? "priv" : "pub"}`;
    const links = await swr(cacheKey, () => {
      const where: Record<string, unknown> = { userId: session.user.id };
      if (categoryId) where.categoryId = categoryId;
      if (!includePrivate) where.isPrivate = false;

      return prisma.link.findMany({
        where,
        include: { category: { select: { id: true, name: true } } },
        orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }],
      });
    }, 30_000);

    return NextResponse.json(links);
  } catch (error) {
    console.error("Failed to fetch links:", error);
    return NextResponse.json(
      { error: "获取链接失败" },
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
    const result = createLinkSchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    const category = await prisma.category.findFirst({
      where: {
        id: result.data.categoryId,
      },
    });

    if (!category) {
      return NextResponse.json(
        { error: "分类不存在" },
        { status: 404 }
      );
    }

    // 同一用户内 URL 不得重复
    const urlConflict = await prisma.link.findFirst({
      where: {
        userId: session.user.id,
        url: { equals: result.data.url, mode: "insensitive" },
      },
    });
    if (urlConflict) {
      return NextResponse.json(
        { error: "该链接已存在" },
        { status: 409 }
      );
    }

    const maxSortOrder = await prisma.link.aggregate({
      where: {
        categoryId: result.data.categoryId,
        userId: session.user.id,
      },
      _max: { sortOrder: true },
    });

    const link = await prisma.link.create({
      data: {
        ...result.data,
        sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
        userId: session.user.id,
      },
    });

    invalidateLinks(session.user.id, result.data.categoryId);

    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    console.error("Failed to create link:", error);
    return NextResponse.json(
      { error: "创建链接失败" },
      { status: 500 }
    );
  }
}
