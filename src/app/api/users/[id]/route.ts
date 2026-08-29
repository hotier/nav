import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { incrementTableVersion } from "@/lib/queries";

type Params = Promise<{ id: string }>;

/** 修改用户角色（仅管理员） */
export async function PATCH(
  request: Request,
  { params }: { params: Params }
) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "无权限访问" }, { status: 403 });
  }

  const { id } = await params;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { role } = body;

    if (!role || !["admin", "user"].includes(role)) {
      return NextResponse.json({ error: "无效的角色值" }, { status: 400 });
    }

    // 管理员降级为普通用户 → 确保至少还有一位管理员
    if (user.role === "admin" && role === "user") {
      const adminCount = await prisma.user.count({ where: { role: "admin" } });
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "必须至少保留一位管理员，请先将其他用户设为管理员" },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { role, tokenVersion: { increment: 1 } },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        image: true,
        role: true,
        createdAt: true,
        _count: { select: { links: true } },
      },
    });

    await incrementTableVersion("User");
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}

/** 删除用户（仅管理员） */
export async function DELETE(
  _request: Request,
  { params }: { params: Params }
) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "无权限访问" }, { status: 403 });
  }

  const { id } = await params;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  // 不允许删除最后一个管理员
  if (user.role === "admin") {
    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "不能删除唯一的管理员，请先将其他用户设为管理员" },
        { status: 400 }
      );
    }
  }

  await prisma.user.delete({ where: { id } });

  await incrementTableVersion("User");
  return NextResponse.json({ success: true });
}
