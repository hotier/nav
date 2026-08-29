/**
 * 密码重置脚本（无邮件服务时的备用方案）
 *
 * 用法：
 *   重置为指定密码：
 *     npx ts-node --compiler-options {"module":"CommonJS"} scripts/reset-password.ts <用户名或邮箱> <新密码>
 *   不传新密码 → 自动生成随机密码并打印
 *     npx ts-node --compiler-options {"module":"CommonJS"} scripts/reset-password.ts <用户名或邮箱>
 *
 * 说明：
 *   - 仅支持 Credentials 登录的用户（password 字段非空）
 *   - 重置后自动递增 tokenVersion，该用户所有已登录设备将强制下线
 *   - 与 account/route.ts 保持一致，使用 bcrypt 12 轮哈希
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

function generatePassword(length = 10): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const all = upper + lower + digits;
  const bytes = crypto.randomBytes(length);
  let pwd = "";
  for (let i = 0; i < length; i++) {
    pwd += all[bytes[i] % all.length];
  }
  // 保证至少含 1 个大写、1 个小写、1 个数字
  return (
    upper[bytes[0] % upper.length] +
    lower[bytes[1] % lower.length] +
    digits[bytes[2] % digits.length] +
    pwd.slice(3)
  );
}

async function main() {
  const [, , identifier, rawPassword] = process.argv;

  if (!identifier) {
    console.error("用法: npx ts-node ... scripts/reset-password.ts <用户名或邮箱> [新密码]");
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ username: identifier }, { email: identifier }],
    },
    select: { id: true, name: true, username: true, email: true, password: true },
  });

  if (!user) {
    console.error(`❌ 未找到用户: ${identifier}`);
    process.exit(1);
  }

  if (!user.password) {
    console.error(`❌ 用户 ${user.username || user.email} 是 OAuth 账号（无本地密码），请通过 GitHub/Google 登录`);
    process.exit(1);
  }

  const newPassword = rawPassword || generatePassword();
  if (rawPassword && rawPassword.length < 6) {
    console.error("❌ 新密码至少 6 位");
    process.exit(1);
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, tokenVersion: { increment: 1 } },
  });

  console.log("✅ 密码已重置:");
  console.log(`   用户名: ${user.username ?? "—"}`);
  console.log(`   邮  箱: ${user.email ?? "—"}`);
  console.log(`   新密码: ${newPassword}`);
  console.log("   ⚠ 该用户所有已登录设备已强制下线（tokenVersion 已递增）");
}

main()
  .catch((e) => {
    console.error("❌ 重置失败:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
