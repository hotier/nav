import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { EmailSendError, isEmailConfigured, sendRegisterCode } from "@/lib/email";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

const CODE_TTL_MS = 5 * 60 * 1000; // 验证码有效期 5 分钟
const COOLDOWN_MS = 60 * 1000; // 同一邮箱 60 秒内限发一次
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export async function POST(request: Request) {
  try {
    // 邮件未配置：注册功能整体关闭（验证码无法送达），仅保留管理员后台重置密码
    if (!isEmailConfigured()) {
      return NextResponse.json(
        { error: "系统未开放自助注册，请联系管理员" },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    // 1. 邮箱格式检查
    if (!email) {
      return NextResponse.json({ error: "请输入邮箱" }, { status: 400 });
    }
    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
    }

    // 2. 限流（查库之前，对任意输入生效，防绕过）
    //    - IP 维度：同一 IP 每小时最多 20 次发送请求
    //    - 邮箱维度：同一邮箱每分钟最多 1 次
    const ip = getClientIp(request);
    if (await isRateLimited(`register-send:ip:${ip}`, 20, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "请求过于频繁，请稍后再试" },
        { status: 429 }
      );
    }
    if (await isRateLimited(`register-send:email:${email}`, 1, 60 * 1000)) {
      return NextResponse.json(
        { error: "发送过于频繁，请稍后再试" },
        { status: 429 }
      );
    }

    // 3. 检查邮箱是否已注册
    const user = await prisma.user.findFirst({ where: { email } });
    if (user) {
      return NextResponse.json({ error: "该邮箱已注册" }, { status: 400 });
    }

    // 4. 同邮箱 60s 冷却（持久层兜底，进程重启后仍生效）
    const existing = await prisma.verificationToken.findFirst({
      where: { identifier: email },
    });
    if (existing) {
      const lastSentAt = existing.expires.getTime() - CODE_TTL_MS;
      if (Date.now() - lastSentAt < COOLDOWN_MS) {
        return NextResponse.json(
          { error: "发送过于频繁，请稍后再试" },
          { status: 429 }
        );
      }
    }

    const code = generateCode();
    const expires = new Date(Date.now() + CODE_TTL_MS);

    // 先删旧码再写新码，保证同邮箱只有一条有效记录
    await prisma.$transaction([
      prisma.verificationToken.deleteMany({ where: { identifier: email } }),
      prisma.verificationToken.create({
        data: { identifier: email, token: code, expires },
      }),
    ]);

    try {
      await sendRegisterCode({
        to: email,
        code,
        siteUrl: new URL(request.url).origin,
      });
    } catch (e) {
      // 发送失败回滚验证码，避免留下不可用的脏数据
      await prisma.verificationToken.deleteMany({ where: { identifier: email } });
      // 完整记录日志（含 Resend 原始错误信息），便于排查
      console.error("发送注册验证码邮件失败:", email, e);
      if (e instanceof EmailSendError && e.statusCode === 429) {
        return NextResponse.json(
          { error: "邮件发送次数已达上限，请稍后再试" },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: "验证码发送失败，请稍后再试" },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "验证码已发送至你的邮箱" });
  } catch (error) {
    console.error("发送注册验证码失败:", error);
    return NextResponse.json(
      { error: "验证码发送失败，请稍后再试" },
      { status: 500 }
    );
  }
}
