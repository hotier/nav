import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCategorySchema } from "@/lib/validators";
import { generateSlug } from "@/lib/slug";
import { swr } from "@/lib/cache";
import { invalidateCategories, incrementTableVersion } from "@/lib/queries";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    // 使用 SWR 缓存（与前端共用数据源，但管理后台需要 links 字段）
    const categories = await swr("admin:categories", () =>
      prisma.category.findMany({
        include: {
          children: { orderBy: { sortOrder: "asc" } },
          links: {
            where: { isPrivate: false },
            orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }],
          },
          _count: { select: { links: true } },
        },
        orderBy: { sortOrder: "asc" },
      }),
    60_000
    );

    return NextResponse.json(categories);
  } catch (error) {
    console.error("Failed to fetch categories:", error);
    return NextResponse.json(
      { error: "获取分类失败" },
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
    const result = createCategorySchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    // 生成唯一 slug
    let slug = generateSlug();
    let existingSlug = await prisma.category.findUnique({ where: { slug } });
    while (existingSlug) {
      slug = generateSlug();
      existingSlug = await prisma.category.findUnique({ where: { slug } });
    }

    const category = await prisma.category.create({
      data: {
        ...result.data,
        slug,
      },
    });

    // 清除缓存，下次请求从数据库拉取最新数据
    invalidateCategories();
    incrementTableVersion("Category").catch((e) => console.warn("[version] Category递增失败:", e));

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error("Failed to create category:", error);
    return NextResponse.json(
      { error: "创建分类失败" },
      { status: 500 }
    );
  }
}
