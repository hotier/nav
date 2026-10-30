import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

/**
 * 本地默认只连 .env.development 指向的测试库。
 * drizzle-kit 会自动加载 .env（生产连接串），若直接读 process.env 容易误迁移生产，
 * 因此对生产执行时必须显式加 ALLOW_PROD_DB=1 并传入 DATABASE_URL。
 */
function databaseUrl(): string {
  if (process.env.ALLOW_PROD_DB !== "1" && existsSync(".env.development")) {
    const match = readFileSync(".env.development", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
    if (match) return match[1];
  }
  return process.env.DATABASE_URL ?? "";
}

export default defineConfig({
  schema: "./server/database/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl(),
  },
  strict: true,
  verbose: true,
});
