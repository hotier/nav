/**
 * 数据库初始化（Drizzle + Neon HTTP）
 *
 * 本地运行默认只连 .env.development 指向的 nav-test 测试库；
 * 部署平台执行时环境变量里已有 DATABASE_URL，直接使用（生产库）。
 *
 * 用法：pnpm db:seed
 * 幂等：管理员已存在时只补 isSystemAdmin，密码仅在来源变化时更新。
 */
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, or, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { appSettings, categories, users } from "../server/database/schema.ts";

// 直接 node 运行时也能落在测试库；显式传入的 DATABASE_URL 优先
if (!process.env.DATABASE_URL && existsSync(".env.development")) {
  process.loadEnvFile(".env.development");
}

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";

function generateSlug(length = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(length);
  let slug = "";
  for (let i = 0; i < length; i++) slug += chars[bytes[i] % chars.length];
  return slug;
}

function generatePassword(length = 8): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const all = upper + lower + digits;
  const bytes = randomBytes(length);
  let pwd = "";
  for (let i = 0; i < length; i++) pwd += all[bytes[i] % all.length];
  return upper[bytes[0] % upper.length] + lower[bytes[1] % lower.length] + digits[bytes[2] % digits.length] + pwd.slice(3);
}

function getSetting(db: ReturnType<typeof drizzle>, key: string) {
  return db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);
}

function putSetting(db: ReturnType<typeof drizzle>, key: string, value: string) {
  return db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("❌ 未找到 DATABASE_URL：请在 .env.development 或环境变量中配置");
    process.exit(1);
  }

  const db = drizzle(neon(url));

  // 连接 + 建表检查（表未建时下方查询会抛错并给出提示）
  try {
    await db.select({ key: appSettings.key }).from(appSettings).limit(1);
  } catch (error) {
    console.error("❌ 数据库连接失败或未初始化，请先执行 pnpm db:migrate");
    console.error(`   ${(error as Error).message}`);
    process.exit(1);
  }
  console.log(`🔗 目标库: ${new URL(url).host}`);
  console.log("🌱 开始初始化数据库...");

  // ===== AUTH_SECRET：环境变量 → 数据库 → 生成后写库（不落文件） =====
  const [secretSetting] = await getSetting(db, "AUTH_SECRET");
  const envSecret = process.env.AUTH_SECRET;
  if (!secretSetting && envSecret) {
    await putSetting(db, "AUTH_SECRET", envSecret);
    console.log("🔑 AUTH_SECRET: 已从环境变量同步到数据库");
  } else if (!secretSetting) {
    await putSetting(db, "AUTH_SECRET", randomBytes(32).toString("base64"));
    console.log("🔑 AUTH_SECRET: 已生成并写入数据库");
  }

  // ===== 管理员密码：环境变量 → 数据库上次保存 → 自动生成 =====
  const [savedPassword] = await getSetting(db, "ADMIN_PASSWORD");
  let adminPassword: string;
  let passwordSource: "env" | "db" | "generated";
  if (process.env.ADMIN_PASSWORD) {
    adminPassword = process.env.ADMIN_PASSWORD;
    passwordSource = "env";
    console.log("🔐 管理员密码: 来自环境变量 ADMIN_PASSWORD");
  } else if (savedPassword?.value) {
    adminPassword = savedPassword.value;
    passwordSource = "db";
    console.log("🔐 管理员密码: 从数据库读取（上次部署保存）");
  } else {
    adminPassword = generatePassword();
    passwordSource = "generated";
    console.log("🔐 管理员密码: 自动生成");
  }

  // ===== 管理员账号 =====
  const [existingAdmin] = await db
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.username, "admin"), eq(users.email, ADMIN_EMAIL)))
    .limit(1);

  let passwordChanged = false;
  if (existingAdmin) {
    await db
      .update(users)
      .set({ isSystemAdmin: true, updatedAt: new Date() })
      .where(eq(users.id, existingAdmin.id));

    if (passwordSource !== "db") {
      await db
        .update(users)
        .set({
          password: await bcrypt.hash(adminPassword, 12),
          email: ADMIN_EMAIL,
          tokenVersion: sql`${users.tokenVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingAdmin.id));
      passwordChanged = true;
    }
  } else {
    await db.insert(users).values({
      username: "admin",
      name: "admin",
      email: ADMIN_EMAIL,
      password: await bcrypt.hash(adminPassword, 12),
      role: "admin",
      isSystemAdmin: true,
    });
  }

  // ===== 默认分类 =====
  const [existingCategory] = await db
    .select({ id: categories.id, slug: categories.slug })
    .from(categories)
    .limit(1);
  if (!existingCategory) {
    await db.insert(categories).values({ name: "默认分类", slug: generateSlug(), sortOrder: 0 });
    console.log("✅ 默认分类已创建");
  } else if (!existingCategory.slug) {
    await db.update(categories).set({ slug: generateSlug() }).where(eq(categories.id, existingCategory.id));
    console.log("✅ 默认分类 slug 已补齐");
  }

  // ===== 持久化管理员信息（供后续部署沿用密码） =====
  if (passwordSource !== "db") await putSetting(db, "ADMIN_PASSWORD", adminPassword);
  await putSetting(db, "ADMIN_USERNAME", ADMIN_USERNAME);
  await putSetting(db, "ADMIN_EMAIL", ADMIN_EMAIL);

  const sourceLabel =
    passwordSource === "env" ? "环境变量 ADMIN_PASSWORD" : passwordSource === "db" ? "数据库（上次部署保存）" : "自动生成";

  console.log("");
  console.log("┌───────────────────────────────────────────────┐");
  console.log("│  管理员账号                                   │");
  console.log("├───────────────────────────────────────────────┤");
  console.log(`│  用户名: ${ADMIN_USERNAME.padEnd(36)} │`);
  console.log(
    `│  密  码: ${(passwordSource === "db" ? "(未变更，使用现有密码)" : adminPassword).padEnd(36)} │`,
  );
  console.log(`│  邮  箱: ${ADMIN_EMAIL.padEnd(36)} │`);
  console.log(`│  来源:   ${sourceLabel.padEnd(36)} │`);
  console.log("└───────────────────────────────────────────────┘");
  if (passwordChanged) console.log("⚠ 密码已更新，旧登录态已失效");
  console.log("");
  console.log("🎉 数据库初始化完成!");
}

main().catch((error) => {
  console.error("❌ 初始化失败:", error);
  process.exit(1);
});
