import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb, getDbPool } from "~~/server/utils/db";
import { incrementTableVersion } from "~~/server/utils/queries";
import { getClientIp, isRateLimited } from "~~/server/utils/rate-limit";
import { timingSafeEqual } from "~~/server/utils/crypto";
import { defineApiHandler, fail } from "~~/server/utils/api";
import { users, verificationTokens } from "~~/server/database/schema";

// GitHub username 规则
const GITHUB_USERNAME_REGEX = /^[a-zA-Z0-9](?!.*--)(?!.*-$)[a-zA-Z0-9-]{0,37}[a-zA-Z0-9]$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default defineApiHandler(async (event) => {
  const ip = getClientIp(event);
  if (await isRateLimited(`register:ip:${ip}`, 30, 60 * 1000)) {
    return fail(event, 429, "注册尝试过于频繁，请稍后再试");
  }

  const body = await readBody<Record<string, unknown>>(event).catch((): Record<string, unknown> => ({}));
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (!username || !email || !password || !code) {
    return fail(event, 400, "用户名、邮箱、密码和验证码不能为空");
  }
  if (username.length > 39 || !GITHUB_USERNAME_REGEX.test(username)) {
    return fail(
      event,
      400,
      "用户名必须为1-39个字符，只能包含字母、数字和单连字符，不能以连字符开头或结尾，不能有连续连字符",
    );
  }
  if (!EMAIL_REGEX.test(email)) return fail(event, 400, "请输入有效的邮箱地址");
  if (password.length < 6) return fail(event, 400, "密码长度不能少于6位");
  if (!/^\d{6}$/.test(code)) return fail(event, 400, "验证码不正确");

  const db = getDb();
  const [existingUsername] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username.toLowerCase()))
    .limit(1);
  if (existingUsername) return fail(event, 400, "用户名已存在");

  const [existingEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existingEmail) return fail(event, 400, "邮箱已被注册");

  // 邮箱维度限流：同一邮箱每分钟最多 5 次，防验证码暴力枚举
  if (await isRateLimited(`register:email:${email}`, 5, 60 * 1000)) {
    return fail(event, 429, "注册尝试过于频繁，请稍后再试");
  }

  // 校验邮箱验证码（一次性使用）
  const [record] = await db
    .select({ token: verificationTokens.token, expires: verificationTokens.expires })
    .from(verificationTokens)
    .where(eq(verificationTokens.identifier, email))
    .limit(1);
  if (!record || record.expires.getTime() < Date.now()) {
    if (record) await db.delete(verificationTokens).where(eq(verificationTokens.identifier, email));
    return fail(event, 400, "验证码不正确或已过期，请重新获取");
  }
  if (!timingSafeEqual(record.token, code)) return fail(event, 400, "验证码不正确");

  const hashedPassword = await bcrypt.hash(password, 10);

  // 建号 + 验证码一次性消费 + User 版本递增同事务
  const user = await getDbPool().transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        username: username.toLowerCase(),
        name: username,
        email,
        password: hashedPassword,
        emailVerified: new Date(),
      })
      .returning({ id: users.id, username: users.username, name: users.name });
    await tx.delete(verificationTokens).where(eq(verificationTokens.identifier, email));
    await incrementTableVersion("User", tx);
    return created;
  });

  return { success: true, user: { id: user.id, username: user.username, name: user.name } };
});
