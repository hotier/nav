import { eq } from "drizzle-orm";
import { getDb } from "~~/server/utils/db";
import { getAuthSecret } from "~~/server/utils/auth-secret";
import { getClientIp, isRateLimited } from "~~/server/utils/rate-limit";
import { encodeBase64Url, hmacSha256Hex, timingSafeEqual } from "~~/server/utils/crypto";
import { defineApiHandler, fail } from "~~/server/utils/api";
import { users, verificationTokens } from "~~/server/database/schema";

// 验证通过后签发的重置令牌有效期：5 分钟
const TOKEN_TTL_MS = 5 * 60 * 1000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createResetToken(email: string, secret: string): Promise<string> {
  const payload = { account: email, exp: Date.now() + TOKEN_TTL_MS };
  const data = encodeBase64Url(JSON.stringify(payload));
  return `${data}.${await hmacSha256Hex(data, secret)}`;
}

export default defineApiHandler(async (event) => {
  const ip = getClientIp(event);
  if (await isRateLimited(`verify:ip:${ip}`, 30, 60 * 1000)) {
    return fail(event, 429, "验证尝试过于频繁，请稍后再试");
  }

  const body = await readBody<Record<string, unknown>>(event).catch((): Record<string, unknown> => ({}));
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (!email || !code) return fail(event, 400, "邮箱和验证码不能为空");
  if (!EMAIL_REGEX.test(email)) return fail(event, 400, "邮箱格式不正确");

  const secret = await getAuthSecret();
  if (!secret) return fail(event, 503, "系统配置异常，请联系管理员");

  const [user] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) return fail(event, 400, "验证码不正确");

  // 邮箱维度限流：同一邮箱每分钟最多 5 次，防暴力枚举
  if (await isRateLimited(`verify:email:${email}`, 5, 60 * 1000)) {
    return fail(event, 429, "验证尝试过于频繁，请稍后再试");
  }

  const [record] = await getDb()
    .select({ token: verificationTokens.token, expires: verificationTokens.expires })
    .from(verificationTokens)
    .where(eq(verificationTokens.identifier, email))
    .limit(1);
  if (!record || record.expires.getTime() < Date.now()) {
    if (record) {
      await getDb().delete(verificationTokens).where(eq(verificationTokens.identifier, email));
    }
    return fail(event, 400, "验证码不存在或已过期，请重新获取");
  }
  if (!timingSafeEqual(record.token, code)) return fail(event, 400, "验证码不正确");

  // 一次性使用：验证通过即删除
  await getDb().delete(verificationTokens).where(eq(verificationTokens.identifier, email));
  return { success: true, token: await createResetToken(email, secret) };
});
