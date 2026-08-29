import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateLinkSchema } from "@/lib/validators";
import { incrementTableVersion } from "@/lib/queries";
import { canAddLinkToCategory } from "@/lib/permissions";
import { cleanUrl } from "@/lib/recognize-url";
import { probeImageUrl } from "@/lib/probe-image";

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
    const role = (session.user as { role?: string }).role;
    const isAdmin = role === "admin";

    const link = await prisma.link.findFirst({
      where: {
        id,
        OR: [
          // 普通用户看不到自己被隐藏的链接；管理员可见（管理/解除隐藏用）
          ...(isAdmin
            ? [{ userId: session.user.id }]
            : [{ userId: session.user.id, isHidden: false }]),
          // 管理员可查看其他用户的公开链接（前提：分类也公开，含被隐藏的）
          ...(isAdmin ? [{ isPrivate: false, category: { isPublic: true } }] : []),
        ],
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

    const role = (session.user as { role?: string }).role;
    const isAdmin = role === "admin";

    // 查询链接（含分类信息），不限制 userId，后续手动做权限检查
    const existing = await prisma.link.findUnique({
      where: { id },
      include: { category: { select: { id: true, name: true, icon: true, isPublic: true, isHidden: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "链接不存在" }, { status: 404 });
    }

    // 权限检查：属主可以编辑；管理员可以编辑「公开分类下的公开链接」
    const isOwner = existing.userId === session.user.id;
    const isPublicLinkInPublicCat = existing.isPrivate === false && existing.category.isPublic;
    if (!isOwner && !(isAdmin && isPublicLinkInPublicCat)) {
      return NextResponse.json({ error: "无权操作此链接" }, { status: 403 });
    }

    // 被隐藏的链接：只有管理员能操作（普通用户不可见，也无权调整可见性）
    if (existing.isHidden && !isAdmin) {
      return NextResponse.json({ error: "该链接已被管理员隐藏，无权操作" }, { status: 403 });
    }

    // isHidden（隐藏/解除隐藏）：仅管理员可设置
    if (!isAdmin && "isHidden" in result.data) {
      return NextResponse.json({ error: "无权设置隐藏状态" }, { status: 403 });
    }
    // 隐藏仅对公开内容施加：管理员隐藏他人链接时强制保持公开
    if (isAdmin && result.data.isHidden === true && !isOwner) {
      result.data.isPrivate = false;
    }

    // 管理员编辑他人公开链接时：禁止改为私有或移入私有分类（防止旁路）
    if (!isOwner && isAdmin) {
      if (result.data.isPrivate === true) {
        return NextResponse.json({ error: "无权将该链接设为私有" }, { status: 403 });
      }
      if (result.data.categoryId && result.data.categoryId !== existing.categoryId) {
        const targetCat = await prisma.category.findUnique({
          where: { id: result.data.categoryId },
          select: { isPublic: true },
        });
        if (!targetCat) {
          return NextResponse.json({ error: "目标分类不存在" }, { status: 404 });
        }
        if (!targetCat.isPublic) {
          return NextResponse.json({ error: "无权将该链接移入私有分类" }, { status: 403 });
        }
      }
    }

    if (result.data.categoryId) {
      const category = await prisma.category.findFirst({
        where: {
          id: result.data.categoryId,
        },
        select: { id: true, userId: true, isPublic: true, isHidden: true },
      });
      if (!category) {
        return NextResponse.json({ error: "分类不存在" }, { status: 404 });
      }
      // 检查用户是否有权向目标分类添加链接
      const permCheck = canAddLinkToCategory(session, category);
      if (permCheck) return permCheck;
    }

    // 清理 URL 并应用于更新数据
    if (result.data.url) {
      result.data.url = cleanUrl(result.data.url);
    }

    // 图标校验：仅在 favicon 值发生变化时探测（打不开 / 非图片 / 尺寸过小），
    // 失败时打印日志并清空图标（前端显示默认图标），不阻塞保存；
    // 只在值变化时校验，避免历史遗留的无效图标阻塞普通编辑；清空图标（空串/null）视为合法
    if (
      "favicon" in result.data &&
      result.data.favicon &&
      result.data.favicon !== existing.favicon
    ) {
      const probe = await probeImageUrl(result.data.favicon);
      if (!probe.ok) {
        console.warn(`[favicon] 链接图标无效已忽略（${probe.reason}）: ${result.data.favicon}`);
        result.data.favicon = "";
      }
    }

    // 更新 URL 时，同一用户内不得与其他链接重复（排除自身）
    // 对于属主，按属主 userId 查重；对于管理员编辑他人链接，按原属主 userId 查重
    if (result.data.url) {
      const ownerId = existing.userId; // 始终按原属主查重
      const urlConflict = await prisma.link.findFirst({
        where: {
          userId: ownerId,
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

    // 版本号在响应返回前递增完成：新旧分类的缓存随版本键一起失效（含管理员编辑他人链接的场景）
    await incrementTableVersion("Link");

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
    const role = (session.user as { role?: string }).role;
    const isAdmin = role === "admin";

    // 查询链接（含分类信息），不限制 userId，后续手动做权限检查
    const existing = await prisma.link.findUnique({
      where: { id },
      select: { id: true, userId: true, isPrivate: true, isHidden: true, categoryId: true, category: { select: { isPublic: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "链接不存在" }, { status: 404 });
    }

    // 权限检查：属主可以删除；管理员可以删除「公开分类下的公开链接」
    const isOwner = existing.userId === session.user.id;
    const isPublicLinkInPublicCat = existing.isPrivate === false && existing.category.isPublic;
    if (!isOwner && !(isAdmin && isPublicLinkInPublicCat)) {
      return NextResponse.json({ error: "无权操作此链接" }, { status: 403 });
    }

    // 被隐藏的链接：只有管理员能删除
    if (existing.isHidden && !isAdmin) {
      return NextResponse.json({ error: "该链接已被管理员隐藏，无权删除" }, { status: 403 });
    }

    await prisma.link.delete({
      where: { id },
    });

    await incrementTableVersion("Link");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete link:", error);
    return NextResponse.json(
      { error: "删除链接失败" },
      { status: 500 }
    );
  }
}
