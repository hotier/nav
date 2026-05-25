import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateLinkSchema } from "@/lib/validators";
import { invalidateLinks, invalidateLinksWithOldCategory, incrementTableVersion } from "@/lib/queries";

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

    const link = await prisma.link.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        category: true,
      },
    });

    if (!link) {
      return NextResponse.json({ error: "链接不存在" }, { status: 404 });
    }

    return NextResponse.json(link);
  } catch (error) {
    console.error("Failed to fetch link:", error);
    return NextResponse.json(
      { error: "获取链接失败" },
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
    const result = updateLinkSchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    const existing = await prisma.link.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "链接不存在" }, { status: 404 });
    }

    if (result.data.categoryId) {
      const category = await prisma.category.findFirst({
        where: {
          id: result.data.categoryId,
        },
      });
      if (!category) {
        return NextResponse.json({ error: "分类不存在" }, { status: 404 });
      }
    }

    // 更新 URL 时，同一用户内不得与其他链接重复（排除自身）
    if (result.data.url) {
      const urlConflict = await prisma.link.findFirst({
        where: {
          userId: session.user.id,
          url: { equals: result.data.url, mode: "insensitive" },
          NOT: { id },
        },
      });
      if (urlConflict) {
        return NextResponse.json(
          { error: "该链接已存在" },
          { status: 409 }
        );
      }
    }

    const link = await prisma.link.update({
      where: { id },
      data: result.data,
      include: { category: { select: { id: true, name: true, icon: true } } },
    });

    // 如果分类发生了变更，需同时清新旧两个分类的缓存
    if (
      result.data.categoryId &&
      result.data.categoryId !== existing.categoryId
    ) {
      invalidateLinksWithOldCategory(
        existing.userId,
        existing.categoryId,
        result.data.categoryId
      );
    } else {
      invalidateLinks(existing.userId, existing.categoryId);
    }
    incrementTableVersion("Link").catch((e) => console.warn("[version] Link递增失败:", e));

    return NextResponse.json(link);
  } catch (error) {
    console.error("Failed to update link:", error);
    return NextResponse.json(
      { error: "更新链接失败" },
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

    const existing = await prisma.link.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "链接不存在" }, { status: 404 });
    }

    await prisma.link.delete({
      where: { id },
    });

    invalidateLinks(existing.userId, existing.categoryId);
    incrementTableVersion("Link").catch((e) => console.warn("[version] Link递增失败:", e));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete link:", error);
    return NextResponse.json(
      { error: "删除链接失败" },
      { status: 500 }
    );
  }
}
