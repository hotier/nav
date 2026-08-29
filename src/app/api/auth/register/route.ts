import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";

// GitHub username validation pattern
const GITHUB_USERNAME_REGEX = /^[a-zA-Z0-9](?!.*--)(?!.*-$)[a-zA-Z0-9-]{0,37}[a-zA-Z0-9]$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidUsername(username: string): boolean {
  if (!username || username.length < 1 || username.length > 39) return false;
  return GITHUB_USERNAME_REGEX.test(username);
}

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export async function POST(request: Request) {
  try {
    // IP 维度限流：同一 IP 每分钟最多 30 次注册尝试（查库前，防爆破）
    const ip = getClientIp(request);
    if (await isRateLimited(`register:ip:${ip}`, 30, 60 * 1000)) {
      return NextResponse.json(
        { error: "注册尝试过于频繁，请稍后再试" },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const username =
      typeof body?.username === "string" ? body.username.trim() : "";
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";

    if (!username || !email || !password || !code) {
      return NextResponse.json(
        { error: "用户名、邮箱、密码和验证码不能为空" },
        { status: 400 }
      );
    }

    // Validate username (GitHub style)
    if (!isValidUsername(username)) {
      return NextResponse.json(
        { error: "用户名必须为1-39个字符，只能包含字母、数字和单连字符，不能以连字符开头或结尾，不能有连续连字符" },
        { status: 400 }
      );
    }

    // Validate email
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "请输入有效的邮箱地址" },
        { status: 400 }
      );
    }

    // Validate password length
    if (password.length < 6) {
      return NextResponse.json(
        { error: "密码长度不能少于6位" },
        { status: 400 }
      );
    }

    // Validate code format
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "验证码不正确" }, { status: 400 });
    }

    // Check if username already exists
    const existingUsername = await prisma.user.findFirst({
      where: { username: username.toLowerCase() },
    });

    if (existingUsername) {
      return NextResponse.json(
        { error: "用户名已存在" },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingEmail = await prisma.user.findFirst({
      where: { email },
    });

    if (existingEmail) {
      return NextResponse.json(
        { error: "邮箱已被注册" },
        { status: 400 }
      );
    }

    // 邮箱维度限流：同一邮箱每分钟最多 5 次注册尝试，防验证码暴力枚举
    if (await isRateLimited(`register:email:${email}`, 5, 60 * 1000)) {
      return NextResponse.json(
        { error: "注册尝试过于频繁，请稍后再试" },
        { status: 429 }
      );
    }

    // 校验邮箱验证码（一次性使用）
    const record = await prisma.verificationToken.findFirst({
      where: { identifier: email },
    });

    if (!record || record.expires.getTime() < Date.now()) {
      if (record) {
        await prisma.verificationToken.deleteMany({ where: { identifier: email } });
      }
      return NextResponse.json(
        { error: "验证码不正确或已过期，请重新获取" },
        { status: 400 }
      );
    }

    if (record.token !== code) {
      return NextResponse.json({ error: "验证码不正确" }, { status: 400 });
    }

    // Encrypt password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user（邮箱已验证通过）
    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase(),
        name: username,
        email,
        password: hashedPassword,
        emailVerified: new Date(),
      },
    });

    // 不再自动创建默认分类：新用户可直接使用他人的公开分类，
    // 也避免每个新用户都产生同名公开分类导致名称重复
    // 验证码一次性使用：注册成功后删除
    await prisma.verificationToken.deleteMany({ where: { identifier: email } });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("注册错误:", error);
    return NextResponse.json(
      { error: "注册失败" },
      { status: 500 }
    );
  }
}
