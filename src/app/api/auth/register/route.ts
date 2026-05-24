import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSlug } from "@/lib/slug";
import bcrypt from "bcryptjs";

// GitHub username validation pattern
const GITHUB_USERNAME_REGEX = /^[a-zA-Z0-9](?!.*--)(?!.*-$)[a-zA-Z0-9-]{0,37}[a-zA-Z0-9]$/;

function isValidUsername(username: string): boolean {
  if (!username || username.length < 1 || username.length > 39) return false;
  return GITHUB_USERNAME_REGEX.test(username);
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export async function POST(request: Request) {
  try {
    const { username, email, password } = await request.json();

    if (!username || !email || !password) {
      return NextResponse.json(
        { error: "用户名、邮箱和密码不能为空" },
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
      where: { email: email.toLowerCase() },
    });

    if (existingEmail) {
      return NextResponse.json(
        { error: "邮箱已被注册" },
        { status: 400 }
      );
    }

    // Encrypt password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase(),
        name: username,
        email: email.toLowerCase(),
        password: hashedPassword,
      },
    });

    // Create default category
    await prisma.category.create({
      data: {
        name: "默认分类",
        slug: generateSlug(),
        sortOrder: 0,
      },
    });

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
