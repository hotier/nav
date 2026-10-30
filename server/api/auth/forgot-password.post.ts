import { eq } from "drizzle-orm";
import { getDb, getDbPool } from "~~/server/utils/db";
import { EmailSendError, isEmailConfigured, sendResetCode } from "~~/server/utils/email";
import { getClientIp, isRateLimited } from "~~/server/utils/rate-limit";
import { randomDigits } from "~~/server/utils/crypto";
import { defineApiHandler, fail } from "~~/server/utils/api";
import { users, verificationTokens } from "~~/server/database/schema";

const CODE_TTL_MS = 5 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default defineApiHandler(async (event) => {
  // 邮件未配置：自助重置密码关闭（验证码无法送达），仅支持管理员后台重置
  if (!isEmailConfigured()) return fail(event, 503, "系统未开放自助重置密码，请联系管理员");

  const body = await readBody<Record<string, unknown>>(event).catch((): Record<string, unknown> => ({}));
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email) return fail(event, 400, "请输入注册邮箱");
  if (!EMAIL_REGEX.test(email)) return fail(event, 400, "邮箱格式不正确");

  // 限流（查库之前）：IP 每小时 20 次，邮箱每分钟 1 次
  const ip = getClientIp(event);
  if (await isRateLimited(`forgot:ip:${ip}`, 20, 60 * 60 * 1000)) {
    return fail(event, 429, "请求过于频繁，请稍后再试");
  }
  if (await isRateLimited(`forgot:account:${email}`, 1, 60 * 1000)) {
    return fail(event, 429, "发送过于频繁，请稍后再试");
  }

  const [user] = await getDb()
    .select({ id: users.id, username: users.username, name: users.name })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) return fail(event, 400, "该邮箱未注册");

  // 同邮箱 60s 冷却（持久层兜底）
  const [existing] = await getDb()
    .select({ expires: verificationTokens.expires })
    .from(verificationTokens)
    .where(eq(verificationTokens.identifier, email))
    .limit(1);
  if (existing) {
    const lastSentAt = existing.expires.getTime() - CODE_TTL_MS;
    if (Date.now() - lastSentAt < COOLDOWN_MS) {
      return fail(event, 429, "发送过于频繁，请稍后再试");
    }
  }

  const code = randomDigits(6);
  const expires = new Date(Date.now() + CODE_TTL_MS);

  await getDbPool().transaction(async (tx) => {
    await tx.delete(verificationTokens).where(eq(verificationTokens.identifier, email));
    await tx.insert(verificationTokens).values({ identifier: email, token: code, expires });
  });

  try {
    await sendResetCode({
      to: email,
      code,
      username: user.username || user.name,
      siteUrl: getRequestURL(event).origin,
    });
  } catch (e) {
    // 发送失败回滚验证码
    await getDb().delete(verificationTokens).where(eq(verificationTokens.identifier, email));
    console.error("发送验证码邮件失败:", email, e);
    if (e instanceof EmailSendError && e.statusCode === 429) {
      return fail(event, 429, "邮件发送次数已达上限，请稍后再试");
    }
    return fail(event, 500, "验证码发送失败，请稍后再试");
  }

  return { message: "验证码已发送至你的邮箱" };
});
