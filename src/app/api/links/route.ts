import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLinkSchema } from "@/lib/validators";
import { incrementTableVersion, getTableVersion } from "@/lib/queries";
import { swr } from "@/lib/cache";
import { buildLinkWhere, canAddLinkToCategory, type LinkViewScope } from "@/lib/permissions";
import { cleanUrl } from "@/lib/recognize-url";
import { linkListKey } from "@/lib/cache-keys";

export async function GET(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    const userRole = (session?.user as { role?: string } | undefined)?.role;

    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");
    const page = parseInt(searchParams.get("page") || "1", 10) || 1;
    const pageSize = parseInt(searchParams.get("pageSize") || "50", 10) || 50;
    const skip = (page - 1) * pageSize;
    const scope: LinkViewScope = searchParams.get("scope") === "manage" ? "manage" : "home";
    const sort = searchParams.get("sort") || "order"; // order | recent

    // 权限中间件：根据用户身份和视图场景生成 where 条件
    const permissionWhere = buildLinkWhere(scope, userId, userRole);

    const where: Record<string, unknown> = { ...permissionWhere };
    if (categoryId) where.categoryId = categoryId;

    // 排序规则：置顶始终优先，二序按 sort 参数切换；createdAt 作 tie-breaker
    // （sortOrder 在创建时按分类内编号，跨分类会重复，缺 tie-breaker 时同值顺序不稳定）
    const orderBy: Record<string, string>[] = sort === "recent"
      ? [{ isPinned: "desc" }, { createdAt: "desc" }, { sortOrder: "asc" }]
      : [{ isPinned: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }];

    // 版本化缓存键：版本号编进键，写操作递增版本后全实例天然失效
    const version = await getTableVersion("Link");
    const cacheKey = linkListKey(version, userId, scope, categoryId, page, sort);
    const { data: links, total } = await swr(cacheKey, async () => {
      const [data, total] = await Promise.all([
        prisma.link.findMany({
          where,
          include: {
            user: { select: { id: true, name: true, username: true, image: true } },
            category: { select: { id: true, name: true, icon: true } },
          },
          orderBy,
          skip,
          take: pageSize,
        }),
        prisma.link.count({ where }),
      ]);
      return { data, total };
    }, 30_000);

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

    // 清理 URL：去首尾空白、去尾部反斜杠
    result.data.url = cleanUrl(result.data.url);

    const category = await prisma.category.findFirst({
      where: {
        id: result.data.categoryId,
      },
      select: { id: true, userId: true, isPublic: true },
    });

    if (!category) {
      return NextResponse.json(
        { error: "分类不存在" },
        { status: 404 }
      );
    }

    // 检查用户是否有权向此分类添加链接
    const permCheck = canAddLinkToCategory(session, category);
    if (permCheck) return permCheck;

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

    // 用户内全局编号（2026-08-29 方案 A：与拖拽重排的全局编号体系统一，
    // 避免“分类内 max+1”与全局编号混用导致新建链接插到列表中间）
    const maxSortOrder = await prisma.link.aggregate({
      where: {
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

    // 版本号在响应返回前递增完成（await）：客户端重拉时任何实例都会用新键查到新数据
    await incrementTableVersion("Link");

    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    console.error("Failed to create link:", error);
    return NextResponse.json(
      { error: "创建链接失败" },
      { status: 500 }
    );
  }
}
