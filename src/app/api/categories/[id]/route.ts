import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateCategorySchema } from "@/lib/validators";
import { incrementTableVersion } from "@/lib/queries";
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

    const categoryWhere = buildCategoryWhere(userId, scope, userRole);
    const linkWhere = buildLinkWhere(scope, userId, userRole);

    const { id } = await params;

    const category = await prisma.category.findFirst({
      where: {
        id,
        ...categoryWhere,
      },
      include: {
        children: {
          where: categoryWhere,
          orderBy: { sortOrder: "asc" },
        },
        links: {
          where: linkWhere,
          orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
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
      select: { id: true, userId: true, isPublic: true, isHidden: true, name: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "分类不存在" }, { status: 404 });
    }

    // 权限检查：管理员可编辑任意分类，普通用户只能编辑自己创建的非公开分类
    const permCheck = canManageCategory(session, existing);
    if (permCheck) return permCheck;

    const userRole = (session.user as { role?: string }).role;
    const isAdmin = userRole === "admin";

    // 被隐藏的分类：只有管理员能操作（普通用户不可见，也无权调整可见性）
    if (existing.isHidden && !isAdmin) {
      return NextResponse.json({ error: "该分类已被管理员隐藏，无权操作" }, { status: 403 });
    }

    const json = await request.json();
    const result = updateCategorySchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    // 所有登录用户均可将「自己可管理的分类」设为公开
    // （canManageCategory 已限定普通用户仅能操作自己创建的分类）
    const updateData: Record<string, unknown> = { ...result.data };

    // isHidden（隐藏/解除隐藏）：仅管理员可设置
    if ("isHidden" in updateData && !isAdmin) {
      return NextResponse.json({ error: "无权设置隐藏状态" }, { status: 403 });
    }
    // 隐藏仅对公开内容施加（管理员隐藏分类时强制保持公开）
    if (updateData.isHidden === true) {
      updateData.isPublic = true;
    }
    // 更新 isPublic/isHidden 时不改 userId（保留创建人）

    // 公开分类名称全局唯一：公开与公开不可重名（公开与私有之间允许重名）。
    // 覆盖：改名、私有改公开、管理员解除隐藏等场景——若最终为公开且撞上其他公开分类，
    // 提示用户修改分类命名后重试（isHidden=true 时上方已强制 isPublic=true）。
    const finalIsPublic =
      typeof updateData.isPublic === "boolean" ? updateData.isPublic : existing.isPublic;
    if (finalIsPublic) {
      const finalName = typeof updateData.name === "string" ? updateData.name : existing.name;
      const dup = await prisma.category.findFirst({
        where: { id: { not: id }, isPublic: true, name: finalName.trim() },
        select: { id: true },
      });
      if (dup) {
        return NextResponse.json(
          { error: "已存在同名公开分类，请修改分类命名后重试" },
          { status: 400 }
        );
      }
    }

    const category = await prisma.category.update({
      where: { id },
      data: updateData,
    });

    await incrementTableVersion("Category");

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
      select: { id: true, userId: true, isPublic: true, isHidden: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "分类不存在" }, { status: 404 });
    }

    // 权限检查：管理员可删除任意分类，普通用户只能删除自己创建的非公开分类
    const permCheck = canManageCategory(session, existing);
    if (permCheck) return permCheck;

    // 被隐藏的分类：只有管理员能删除
    const userRole = (session.user as { role?: string }).role;
    if (existing.isHidden && userRole !== "admin") {
      return NextResponse.json({ error: "该分类已被管理员隐藏，无权删除" }, { status: 403 });
    }

    await prisma.category.delete({
      where: { id },
    });

    await incrementTableVersion("Category");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete category:", error);
    return NextResponse.json(
      { error: "删除分类失败" },
      { status: 500 }
    );
  }
}
