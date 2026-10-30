export { getDb, getDbPool, closeDbPool } from "~~/server/database/client";
export type { Db, DbPool, DbExecutor } from "~~/server/database/client";

/** neon-http / neon-serverless 的 execute 返回结构不同，统一取出 rows */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

/**
 * 唯一约束冲突（PostgreSQL 23505）。
 * Drizzle 把驱动错误包在 cause 层，需同时检查当前错误与 cause 链。
 */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    const code = (current as { code?: unknown }).code;
    if (code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
