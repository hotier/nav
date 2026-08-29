import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { deleteUserAuthCache } from "@/lib/user-cache";

// 与 verify-code 签发的重置令牌有效期保持一致：5 分钟
const TOKEN_TTL_MS = 5 * 60 * 1000;

function hmacSign(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

function verifyResetToken(
  token: string,
  secret: string
): { account: string; exp: number } | null {
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  if (hmacSign(data, secret) !== sig) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    if (
      typeof payload.account !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const newPassword =
      typeof body?.newPassword === "string" ? body.newPassword : "";

    if (!token) {
      return NextResponse.json(
        { error: "请先验证邮箱验证码" },
        { status: 400 }
      );
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: "新密码至少6位" }, { status: 400 });
    }

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "系统配置异常，请联系管理员" },
        { status: 503 }
      );
    }

    const payload = verifyResetToken(token, secret);
    if (!payload) {
      return NextResponse.json(
        { error: "验证已过期或无效，请重新获取验证码" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findFirst({
      where: { email: payload.account },
    });
    if (!user) {
      return NextResponse.json({ error: "账号不存在或已失效" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        // 递增 tokenVersion：所有已登录设备下次请求时强制下线
        tokenVersion: { increment: 1 },
      },
    });
    // 清除认证缓存：旧 token 立即失效，无需等 Redis TTL
    await deleteUserAuthCache(user.id);

    return NextResponse.json({
      success: true,
      message: "密码已重置，请使用新密码登录",
    });
  } catch (error) {
    console.error("重置密码失败:", error);
    return NextResponse.json(
      { error: "重置密码失败，请稍后再试" },
      { status: 500 }
    );
  }
}
