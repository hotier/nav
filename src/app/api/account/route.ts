import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { swr, deleteCached } from "@/lib/cache";

// GET: 获取当前用户信息
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const user = await swr(`account:${session.user.id}`, () =>
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          image: true,
          createdAt: true,
          _count: { select: { links: true } },
        },
      }),
    60_000
    );

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("获取用户信息失败:", error);
    return NextResponse.json({ error: "获取用户信息失败" }, { status: 500 });
  }
}

// PUT: 更新用户信息（名称、邮箱、密码）
export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await request.json();
    const { name, email, image, currentPassword, newPassword } = body;

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    // 更新名称
    if (name !== undefined) {
      updateData.name = name;
    }

    // 更新邮箱（需校验唯一性和格式）
    if (email !== undefined) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
      }
      const existing = await prisma.user.findFirst({
        where: { email, NOT: { id: session.user.id } },
      });
      if (existing) {
        return NextResponse.json({ error: "该邮箱已被其他账号使用" }, { status: 400 });
      }
      updateData.email = email;
    }

    // 更新头像 URL
    if (image !== undefined) {
      // 允许清空头像
      updateData.image = image;
    }

    // 修改密码（仅 Credentials 用户）
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json({ error: "请输入当前密码" }, { status: 400 });
      }
      if (!user.password) {
        return NextResponse.json(
          { error: "OAuth 登录的用户无密码，请使用对应平台修改密码" },
          { status: 400 }
        );
      }
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) {
        return NextResponse.json({ error: "当前密码不正确" }, { status: 400 });
      }
      if (newPassword.length < 6) {
        return NextResponse.json({ error: "新密码至少6位" }, { status: 400 });
      }
      updateData.password = await bcrypt.hash(newPassword, 12);
      // 递增 tokenVersion，所有已登录设备下次请求时强制下线
      updateData.tokenVersion = user.tokenVersion + 1;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "没有要更新的内容" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        image: true,
        createdAt: true,
      },
    });

    // 清除当前用户缓存，下次 GET 自动从库刷新
    deleteCached(`account:${session.user.id}`);

    return NextResponse.json(updated);
  } catch (error) {
    console.error("更新用户信息失败:", error);
    return NextResponse.json({ error: "更新用户信息失败" }, { status: 500 });
  }
}
