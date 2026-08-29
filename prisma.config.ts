import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI 在存在 prisma.config.ts 时不会自动加载 .env（"skipping environment
 * variable loading"），这里手动补齐，仅本地开发/CI 需要（Vercel 上环境变量由平台注入）。
 * 不覆盖已存在的环境变量，无第三方依赖。
 */
try {
  const envPath = join(process.cwd(), ".env");
  for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !m[1].startsWith("#") && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2];
    }
  }
} catch {
  // .env 不存在时忽略（Vercel 等平台注入场景）
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "npx ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts",
  },
});
