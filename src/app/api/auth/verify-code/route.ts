import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

// 验证通过后签发的重置令牌有效期：5 分钟
const TOKEN_TTL_MS = 5 * 60 * 1000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hmacSign(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

function createResetToken(email: string, secret: string): string {
  const payload = { account: email, exp: Date.now() + TOKEN_TTL_MS };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${hmacSign(data, secret)}`;
}

export async function POST(request: Request) {
  try {
    // IP 维度限流：同一 IP 每分钟最多 30 次验证尝试（查库前）
    const ip = getClientIp(request);
    if (await isRateLimited(`verify:ip:${ip}`, 30, 60 * 1000)) {
      return NextResponse.json(
        { error: "验证尝试过于频繁，请稍后再试" },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";

    if (!email || !code) {
      return NextResponse.json(
        { error: "邮箱和验证码不能为空" },
        { status: 400 }
      );
    }
    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
    }

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "系统配置异常，请联系管理员" },
        { status: 503 }
      );
    }

    const user = await prisma.user.findFirst({ where: { email } });
    if (!user?.email) {
      return NextResponse.json({ error: "验证码不正确" }, { status: 400 });
    }

    // 邮箱维度限流：同一邮箱每分钟最多 5 次验证尝试，防暴力枚举
    if (await isRateLimited(`verify:email:${email}`, 5, 60 * 1000)) {
      return NextResponse.json(
        { error: "验证尝试过于频繁，请稍后再试" },
        { status: 429 }
      );
    }

    const record = await prisma.verificationToken.findFirst({
      where: { identifier: email },
    });

    if (!record || record.expires.getTime() < Date.now()) {
      if (record) {
        await prisma.verificationToken.deleteMany({ where: { identifier: email } });
      }
      return NextResponse.json(
        { error: "验证码不存在或已过期，请重新获取" },
        { status: 400 }
      );
    }

    if (record.token !== code) {
      return NextResponse.json({ error: "验证码不正确" }, { status: 400 });
    }

    // 验证通过：删除验证码（一次性使用），签发重置令牌
    await prisma.verificationToken.deleteMany({ where: { identifier: email } });
    const token = createResetToken(email, secret);

    return NextResponse.json({ success: true, token });
  } catch (error) {
    console.error("验证验证码失败:", error);
    return NextResponse.json({ error: "验证失败，请稍后再试" }, { status: 500 });
  }
}
