import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateCategorySchema } from "@/lib/validators";
import { invalidateCategories } from "@/lib/queries";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id } = await params;

    const category = await prisma.category.findFirst({
      where: { id },
      include: {
        children: {
          orderBy: { sortOrder: "asc" },
        },
        links: {
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
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id } = await params;
    const json = await request.json();
    const result = updateCategorySchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    const existing = await prisma.category.findFirst({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "分类不存在" }, { status: 404 });
    }

    const category = await prisma.category.update({
      where: { id },
      data: result.data,
    });

    invalidateCategories();

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
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.category.findFirst({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "分类不存在" }, { status: 404 });
    }

    await prisma.category.delete({
      where: { id },
    });

    invalidateCategories();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete category:", error);
    return NextResponse.json(
      { error: "删除分类失败" },
      { status: 500 }
    );
  }
}
