import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLinkSchema } from "@/lib/validators";
import { invalidateLinks, incrementTableVersion } from "@/lib/queries";
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
    const page = parseInt(searchParams.get("page") || "1", 10) || 1;
    const pageSize = parseInt(searchParams.get("pageSize") || "50", 10) || 50;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { userId: session.user.id };
    if (categoryId) where.categoryId = categoryId;
    if (!includePrivate) where.isPrivate = false;

    // SWR 缓存，前端页面和后台管理共用同一套查询
    const cacheKey = `links:api:${session.user.id}:${categoryId || "all"}:${includePrivate ? "priv" : "pub"}:p${page}`;
    const links = await swr(cacheKey, () => {
      return prisma.link.findMany({
        where,
        include: { category: { select: { id: true, name: true, icon: true } } },
        orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }],
        skip,
        take: pageSize,
      });
    }, 30_000);

    // 总数（轻量 COUNT，不缓存）
    const total = await prisma.link.count({ where });

    return NextResponse.json({ data: links, total });
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
    incrementTableVersion("Link").catch((e) => console.warn("[version] Link递增失败:", e));

    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    console.error("Failed to create link:", error);
    return NextResponse.json(
      { error: "创建链接失败" },
      { status: 500 }
    );
  }
}
