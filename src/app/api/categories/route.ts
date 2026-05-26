import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCategorySchema } from "@/lib/validators";
import { generateSlug } from "@/lib/slug";
import { swr } from "@/lib/cache";
import { invalidateCategories, incrementTableVersion } from "@/lib/queries";
import { buildLinkWhere, buildCategoryWhere, cacheScope, type LinkViewScope } from "@/lib/permissions";

export async function GET(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    const userRole = (session?.user as { role?: string } | undefined)?.role;

    const { searchParams } = new URL(request.url);
    const scope: LinkViewScope = searchParams.get("scope") === "manage" ? "manage" : "home";
    // forSelector=true 时跳过"有可见链接"过滤，用于分类选择器（空公开分类也能选）
    const forSelector = searchParams.get("forSelector") === "true";

    // 分类级权限：普通用户只看公开 + 自己的
    const categoryWhere = buildCategoryWhere(userId);

    // 根据 scope 生成链接子查询的 where 条件
    const linkWhere = buildLinkWhere(scope, userId, userRole);

    // 使用 SWR 缓存，按 scope 区分缓存键
    const scopeKey = cacheScope(scope);
    const uid = userId || "anon";
    const cacheKey = `categories:api:${scopeKey}:${uid}`;
    const categories = await swr(cacheKey, () =>
      prisma.category.findMany({
        where: {
          AND: [
            categoryWhere,
            // 首页：只展示有可见链接的分类；管理后台/选择器：展示所有
            scope === "home" && linkWhere && !forSelector
              ? { links: { some: linkWhere } }
              : {},
          ],
        } as Record<string, unknown>,
        include: {
          children: {
            orderBy: { sortOrder: "asc" },
          },
          links: {
            where: linkWhere,
            orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }],
          },
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

    // 需要登录才能创建分类
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const json = await request.json();
    const result = createCategorySchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    const userRole = (session.user as { role?: string }).role;

    // 普通用户创建的分类默认为私有（isPublic: false），管理员可创建公开分类
    const isPublic = userRole === "admin" ? (result.data.isPublic ?? true) : false;

    // 生成唯一 slug
    let slug = generateSlug();
    let existingSlug = await prisma.category.findUnique({ where: { slug } });
    while (existingSlug) {
      slug = generateSlug();
      existingSlug = await prisma.category.findUnique({ where: { slug } });
    }

    const category = await prisma.category.create({
      data: {
        name: result.data.name,
        icon: result.data.icon,
        parentId: result.data.parentId,
        sortOrder: result.data.sortOrder ?? 0,
        slug,
        isPublic,
        userId: isPublic ? null : session.user.id,
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
