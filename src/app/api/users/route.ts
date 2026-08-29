import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { incrementTableVersion } from "@/lib/queries";
import bcrypt from "bcryptjs";

// 用户列表 / 新建账号为 admin 专用低频接口，直查 DB 不缓存
// （管理操作频率极低，缓存收益可忽略；省去版本化/失效的维护成本）

// GitHub username validation pattern
const GITHUB_USERNAME_REGEX = /^[a-zA-Z0-9](?!.*--)(?!.*-$)[a-zA-Z0-9-]{0,37}[a-zA-Z0-9]$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidUsername(username: string): boolean {
  if (!username || username.length < 1 || username.length > 39) return false;
  return GITHUB_USERNAME_REGEX.test(username);
}

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  username: true,
  image: true,
  role: true,
  isSystemAdmin: true,
  createdAt: true,
  _count: { select: { links: true } },
} as const;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "无权限访问" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: USER_SELECT,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(users);
}

/**
 * 管理员手动创建账号（仅管理员）
 *
 * 降级策略：当未配置 Resend（邮件服务）时，自助注册因无法邮箱验证而整体关闭，
 * 由管理员在后台代为创建账号。创建后视为已验证（emailVerified = now），可直接登录。
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "无权限访问" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const username =
    typeof body?.username === "string" ? body.username.trim() : "";
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const role = typeof body?.role === "string" ? body.role : "user";

  if (!username || !email || !password) {
    return NextResponse.json(
      { error: "用户名、邮箱和密码不能为空" },
      { status: 400 }
    );
  }

  if (!isValidUsername(username)) {
    return NextResponse.json(
      { error: "用户名必须为1-39个字符，只能包含字母、数字和单连字符，不能以连字符开头或结尾，不能有连续连字符" },
      { status: 400 }
    );
  }

  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "密码长度不能少于6位" },
      { status: 400 }
    );
  }

  if (!["admin", "user"].includes(role)) {
    return NextResponse.json({ error: "无效的角色值" }, { status: 400 });
  }

  // 用户名唯一（与自助注册一致，统一小写存储）
  const existingUsername = await prisma.user.findFirst({
    where: { username: username.toLowerCase() },
  });
  if (existingUsername) {
    return NextResponse.json({ error: "用户名已存在" }, { status: 400 });
  }

  // 邮箱唯一
  const existingEmail = await prisma.user.findFirst({ where: { email } });
  if (existingEmail) {
    return NextResponse.json({ error: "邮箱已被注册" }, { status: 400 });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      username: username.toLowerCase(),
      name: name || username,
      email,
      password: hashedPassword,
      role,
      // 管理员手动创建：视为已验证，账号立即可用
      emailVerified: new Date(),
    },
    select: USER_SELECT,
  });

  // 不再自动创建默认分类：新用户可直接使用他人的公开分类，
  // 也避免每个新用户都产生同名公开分类导致名称重复

  await incrementTableVersion("User");
  return NextResponse.json(user, { status: 201 });
}
