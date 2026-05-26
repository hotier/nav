import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateCategorySchema } from "@/lib/validators";
import { invalidateCategories, incrementTableVersion } from "@/lib/queries";
import { buildLinkWhere, buildCategoryWhere, canManageCategory, type LinkViewScope } from "@/lib/permissions";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scope: LinkViewScope = searchParams.get("scope") === "manage" ? "manage" : "home";
    const userId = session.user.id;
    const userRole = (session.user as { role?: string }).role;

    const categoryWhere = buildCategoryWhere(userId);
    const linkWhere = buildLinkWhere(scope, userId, userRole);

    const { id } = await params;

    const category = await prisma.category.findFirst({
      where: {
        id,
        ...categoryWhere,
      },
      include: {
        children: {
          orderBy: { sortOrder: "asc" },
        },
        links: {
          where: linkWhere,
          orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }],
        },
      },
    });

    if (!category) {
      return NextResponse.json({ error: "分类不存在" }, { status: 404 });
    }

    return NextResponse.json(category);
  } catch (error) {
    console.error("Failed to fetch category:", error);
    return NextResponse.json(
      { error: "获取分类失败" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { id } = await params;

    // 查询分类当前信息（含权限字段）
    const existing = await prisma.category.findUnique({
      where: { id },
      select: { id: true, userId: true, isPublic: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "分类不存在" }, { status: 404 });
    }

    // 权限检查：管理员可编辑任意分类，普通用户只能编辑自己创建的非公开分类
    const permCheck = canManageCategory(session, existing);
    if (permCheck) return permCheck;

    const json = await request.json();
    const result = updateCategorySchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    const userRole = (session.user as { role?: string }).role;
    const isAdmin = userRole === "admin";

    // 非管理员不能设置 isPublic（防止普通用户将自己私有分类改为公开）
    const updateData: Record<string, unknown> = { ...result.data };
    if (!isAdmin && "isPublic" in updateData) {
      delete updateData.isPublic;
    }
    // 管理员设置 isPublic 为 true 时，清空 userId（公开分类不归属任何人）
    if (isAdmin && updateData.isPublic === true) {
      updateData.userId = null;
    }

    const category = await prisma.category.update({
      where: { id },
      data: updateData,
    });

    invalidateCategories();
    incrementTableVersion("Category").catch((e) => console.warn("[version] Category递增失败:", e));

    return NextResponse.json(category);
  } catch (error) {
    console.error("Failed to update category:", error);
    return NextResponse.json(
      { error: "更新分类失败" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { id } = await params;

    // 查询分类当前信息（含权限字段）
    const existing = await prisma.category.findUnique({
      where: { id },
      select: { id: true, userId: true, isPublic: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "分类不存在" }, { status: 404 });
    }

    // 权限检查：管理员可删除任意分类，普通用户只能删除自己创建的非公开分类
    const permCheck = canManageCategory(session, existing);
    if (permCheck) return permCheck;

    await prisma.category.delete({
      where: { id },
    });

    invalidateCategories();
    incrementTableVersion("Category").catch((e) => console.warn("[version] Category递增失败:", e));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete category:", error);
    return NextResponse.json(
      { error: "删除分类失败" },
      { status: 500 }
    );
  }
}
