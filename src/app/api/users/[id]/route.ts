import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { incrementTableVersion } from "@/lib/queries";
import { deleteUserAuthCache } from "@/lib/user-cache";
import bcrypt from "bcryptjs";

type Params = Promise<{ id: string }>;

/** 修改用户角色 / 管理员重置密码（仅管理员） */
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
    const { role, password } = body;

    if (role !== undefined && !["admin", "user"].includes(role)) {
      return NextResponse.json({ error: "无效的角色值" }, { status: 400 });
    }

    // 系统级管理员（项目初始化账号）不可降级
    if (user.isSystemAdmin && role === "user") {
      return NextResponse.json(
        { error: "系统级管理员不可修改为普通用户" },
        { status: 400 }
      );
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

    if (password !== undefined) {
      if (typeof password !== "string" || password.length < 6) {
        return NextResponse.json(
          { error: "新密码长度不能少于6位" },
          { status: 400 }
        );
      }
    }

    // 无任何可更新字段
    if (role === undefined && password === undefined) {
      return NextResponse.json({ error: "没有可更新的内容" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(role !== undefined ? { role } : {}),
        // 重置密码（或改角色）都递增 tokenVersion → 旧 session/token 立即失效
        ...(password !== undefined
          ? { password: await bcrypt.hash(password, 10) }
          : {}),
        tokenVersion: { increment: 1 },
      },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        image: true,
        role: true,
        isSystemAdmin: true,
        createdAt: true,
        _count: { select: { links: true } },
      },
    });

    await incrementTableVersion("User");
    // 递增 tokenVersion → 清除认证缓存，旧 token 立即失效
    await deleteUserAuthCache(id);
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

  // 系统级管理员（项目初始化账号）不可删除
  if (user.isSystemAdmin) {
    return NextResponse.json(
      { error: "系统级管理员不可删除" },
      { status: 400 }
    );
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
  // 清除认证缓存：该用户旧 token 立即失效，无需等 Redis TTL
  await deleteUserAuthCache(id);

  await incrementTableVersion("User");
  return NextResponse.json({ success: true });
}
