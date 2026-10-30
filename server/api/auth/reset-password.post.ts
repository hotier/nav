import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb, getDbPool } from "~~/server/utils/db";
import { getAuthSecret } from "~~/server/utils/auth-secret";
import { incrementTableVersion } from "~~/server/utils/queries";
import { deleteUserAuthCache } from "~~/server/utils/user-cache";
import { decodeBase64Url, hmacSha256Hex, timingSafeEqual } from "~~/server/utils/crypto";
import { defineApiHandler, fail } from "~~/server/utils/api";
import { users } from "~~/server/database/schema";

async function verifyResetToken(
  token: string,
  secret: string,
): Promise<{ account: string; exp: number } | null> {
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  if (!timingSafeEqual(await hmacSha256Hex(data, secret), sig)) return null;

  const json = decodeBase64Url(data);
  if (!json) return null;
  try {
    const payload = JSON.parse(json);
    if (typeof payload.account !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export default defineApiHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event).catch((): Record<string, unknown> => ({}));
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

  if (!token) return fail(event, 400, "请先验证邮箱验证码");
  if (newPassword.length < 6) return fail(event, 400, "新密码至少6位");

  const secret = await getAuthSecret();
  const payload = await verifyResetToken(token, secret);
  if (!payload) return fail(event, 400, "验证已过期或无效，请重新获取验证码");

  const [user] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, payload.account))
    .limit(1);
  if (!user) return fail(event, 400, "账号不存在或已失效");

  const hashedPassword = await bcrypt.hash(newPassword, 12);
  // 改密 + User 版本递增同事务；tokenVersion 递增使所有已登录设备失效
  await getDbPool().transaction(async (tx) => {
    await tx
      .update(users)
      .set({ password: hashedPassword, tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, user.id));
    await incrementTableVersion("User", tx);
  });
  await deleteUserAuthCache(user.id);

  return { success: true, message: "密码已重置，请使用新密码登录" };
});
