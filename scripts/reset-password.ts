/**
 * 密码重置脚本（无邮件服务时的备用方案，Drizzle 版）
 *
 * 用法：
 *   重置为指定密码：pnpm db:reset-password <用户名或邮箱> <新密码>
 *   不传新密码：自动生成随机密码并打印
 *
 * 说明：
 *   - 本地默认只连 .env.development 指向的测试库
 *   - 仅支持 Credentials 登录的用户（password 字段非空）
 *   - 重置后递增 tokenVersion，该用户所有已登录设备将强制下线
 */
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, or, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { users } from "../server/database/schema.ts";

if (!process.env.DATABASE_URL && existsSync(".env.development")) {
  process.loadEnvFile(".env.development");
}

function generatePassword(length = 10): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const all = upper + lower + digits;
  const bytes = randomBytes(length);
  let pwd = "";
  for (let i = 0; i < length; i++) pwd += all[bytes[i] % all.length];
  return upper[bytes[0] % upper.length] + lower[bytes[1] % lower.length] + digits[bytes[2] % digits.length] + pwd.slice(3);
}

async function main() {
  const [, , identifier, rawPassword] = process.argv;
  if (!identifier) {
    console.error("用法: pnpm db:reset-password <用户名或邮箱> [新密码]");
    process.exit(1);
  }
  if (rawPassword && rawPassword.length < 6) {
    console.error("❌ 新密码至少 6 位");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("❌ 未找到 DATABASE_URL：请在 .env.development 或环境变量中配置");
    process.exit(1);
  }
  const db = drizzle(neon(url));

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      email: users.email,
      password: users.password,
    })
    .from(users)
    .where(or(eq(users.username, identifier), eq(users.email, identifier)))
    .limit(1);

  if (!user) {
    console.error(`❌ 未找到用户: ${identifier}`);
    process.exit(1);
  }
  if (!user.password) {
    console.error(`❌ 用户 ${user.username || user.email} 是 OAuth 账号（无本地密码），请通过第三方登录`);
    process.exit(1);
  }

  const newPassword = rawPassword || generatePassword();
  await db
    .update(users)
    .set({
      password: await bcrypt.hash(newPassword, 12),
      tokenVersion: sql`${users.tokenVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  console.log("✅ 密码已重置:");
  console.log(`   用户名: ${user.username ?? "—"}`);
  console.log(`   邮  箱: ${user.email ?? "—"}`);
  console.log(`   新密码: ${newPassword}`);
  console.log("   ⚠ 该用户所有已登录设备已强制下线（tokenVersion 已递增）");
}

main().catch((error) => {
  console.error("❌ 重置失败:", error);
  process.exit(1);
});
