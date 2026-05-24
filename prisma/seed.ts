import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

function generateSlug(length = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.randomBytes(length);
  let slug = "";
  for (let i = 0; i < length; i++) {
    slug += chars[bytes[i] % chars.length];
  }
  return slug;
}

function generatePassword(length = 8): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const all = upper + lower + digits;
  const bytes = crypto.randomBytes(length);
  let pwd = "";
  for (let i = 0; i < length; i++) {
    pwd += all[bytes[i] % all.length];
  }
  return (
    upper[bytes[0] % upper.length] +
    lower[bytes[1] % lower.length] +
    digits[bytes[2] % digits.length] +
    pwd.slice(3)
  );
}

/**
 * 确保 AUTH_SECRET 存在：
 * - 环境变量已设置且非空 → 直接用，不修改
 * - .env 中有 AUTH_SECRET="" 占位 → 替换为真实值，写入文件
 * - 完全不存在 → 追加到 .env 末尾，写入文件
 *
 * 第一次生成的 AUTH_SECRET 会写入 .env，后续部署永远使用同一个值。
 */
function ensureAuthSecret(): void {
  if (process.env.AUTH_SECRET) {
    console.log("🔑 AUTH_SECRET: 使用已有环境变量");
    return;
  }

  const secret = crypto.randomBytes(32).toString("hex");
  const envPath = path.resolve(process.cwd(), ".env");

  let envContent = "";
  try {
    envContent = fs.readFileSync(envPath, "utf-8");
  } catch {
    // .env 不存在，后续 appendFileSync 会创建
  }

  if (envContent.includes("AUTH_SECRET=")) {
    // .env 中已有 AUTH_SECRET= 但值为空占位 → 替换该行
    envContent = envContent.replace(
      /^AUTH_SECRET=.*$/m,
      `AUTH_SECRET="${secret}"`
    );
    fs.writeFileSync(envPath, envContent, "utf-8");
    console.log("🔑 AUTH_SECRET: .env 中原占位已替换为真实值");
  } else {
    // 完全不存在 → 追加新行
    const line = `\n# Auto-generated AUTH_SECRET (do not modify)\nAUTH_SECRET="${secret}"\n`;
    fs.appendFileSync(envPath, line, "utf-8");
    console.log("🔑 AUTH_SECRET: 已自动生成并写入 .env");
  }

  console.log(`   ${secret}`);

  // 设为当前进程变量，确保 seed 及后续 build 可用
  process.env.AUTH_SECRET = secret;
}

/**
 * 数据库前置检查：
 * - DATABASE_URL 环境变量是否已配置
 * - 数据库是否可连通
 * 任意一项不通过 → 直接报错退出
 */
async function checkDatabase(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("❌ 未找到 DATABASE_URL 环境变量");
    console.error("   请在 .env 或部署平台环境变量中配置数据库连接地址");
    process.exit(1);
  }

  console.log("🔍 检测数据库连接...");

  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    console.log("✅ 数据库连接正常");
  } catch (error) {
    console.error("❌ 数据库连接失败，请检查 DATABASE_URL 是否正确");
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    }
    process.exit(1);
  }
}

async function main() {
  // ---- 最早执行：数据库连接检测 ----
  await checkDatabase();
  // ---- 确保 AUTH_SECRET 就绪 ----
  ensureAuthSecret();

  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
  const fromEnv = !!process.env.ADMIN_PASSWORD;
  const ADMIN_PASSWORD = fromEnv
    ? process.env.ADMIN_PASSWORD!
    : generatePassword();

  console.log("🌱 开始初始化数据库...");

  // 检查是否已存在 admin 用户
  const existingAdmin = await prisma.user.findFirst({
    where: {
      OR: [
        { username: "admin" },
        { email: ADMIN_EMAIL },
      ],
    },
  });

  if (existingAdmin) {
    console.log("⏭ 管理员账号已存在，跳过创建...");

    // 已有管理员，确保存在默认分类 + 补齐 slug
    const existingCategory = await prisma.category.findFirst();

    if (!existingCategory) {
      await prisma.category.create({
        data: {
          name: "默认分类",
          slug: generateSlug(),
          sortOrder: 0,
        },
      });
      console.log("✅ 默认分类已创建");
    } else if (!existingCategory.slug) {
      await prisma.category.update({
        where: { id: existingCategory.id },
        data: { slug: generateSlug() },
      });
      console.log("✅ 默认分类 slug 已补齐");
    }

    return;
  }

  // 创建管理员用户
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await prisma.user.create({
    data: {
      username: "admin",
      name: "admin",
      email: ADMIN_EMAIL,
      password: hashedPassword,
    },
  });

  console.log("✅ 管理员账号已创建");
  console.log(`   用户名: admin`);
  console.log(`   密码: ${fromEnv ? "（来自环境变量 ADMIN_PASSWORD）" : ADMIN_PASSWORD}`);
  console.log(`   邮箱: ${ADMIN_EMAIL}`);

  if (!fromEnv) {
    console.log("   ⚠ 请妥善保管以上密码，本次部署后不再显示");
  }

  // 创建默认分类
  await prisma.category.create({
    data: {
      name: "默认分类",
      slug: generateSlug(),
      sortOrder: 0,
    },
  });

  console.log("✅ 默认分类已创建");
  console.log("🎉 数据库初始化完成!");
}

main()
  .catch((e) => {
    console.error("❌ 初始化失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
