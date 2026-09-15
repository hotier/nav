import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * 使用 Prisma ORM 的 Rust-free 版本（schema 中 engineType = "client"）：
 * 由 @prisma/adapter-pg 以纯 JS 驱动连接 PostgreSQL，不再下载/打包约 20MB 的
 * Rust query engine 二进制，Serverless 函数体积可显著下降。
 *
 * 注意：next build 收集页面数据时也会加载本模块，因此构建期不能因缺少
 * DATABASE_URL 而抛错；未配置时回退占位串，真正的连接错误留到运行期暴露。
 */
const connectionString =
  process.env.DATABASE_URL || "postgresql://localhost:5432/placeholder";

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    // 不使用 "query" 日志级别：Prisma 内部会缓冲所有查询日志导致内存泄漏
    log: ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
