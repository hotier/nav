import { neon, Pool } from "@neondatabase/serverless";
import type { SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs } from "drizzle-orm/neon-serverless";
import * as relations from "./relations";
import * as schema from "./schema";

const fullSchema = { ...schema, ...relations };
export type AppSchema = typeof fullSchema;

function databaseUrl(): string {
  const config = useRuntimeConfig();
  const url = (config.databaseUrl as string | undefined) || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return url;
}

function createHttpDb(url: string) {
  return drizzle(neon(url), { schema: fullSchema });
}

function createPoolDb(url: string) {
  const pool = new Pool({
    connectionString: url,
    max: 3,
    idleTimeoutMillis: 10_000,
  });
  return { pool, db: drizzleWs(pool, { schema: fullSchema }) };
}

let httpDb: ReturnType<typeof createHttpDb> | undefined;
let poolHolder: ReturnType<typeof createPoolDb> | undefined;

/** 所有读走 HTTP 驱动（无连接池压力） */
export function getDb() {
  return (httpDb ??= createHttpDb(databaseUrl()));
}

/** 所有写走 WebSocket Pool（写必须与版本递增同事务） */
export function getDbPool() {
  return (poolHolder ??= createPoolDb(databaseUrl())).db;
}

export type Db = ReturnType<typeof createHttpDb>;
export type DbPool = ReturnType<typeof createPoolDb>["db"];
/** 同时接受 HTTP 实例与 transaction 回调参数（只依赖 execute） */
export type DbExecutor = {
  execute: (query: SQL) => Promise<unknown>;
};

export async function closeDbPool() {
  if (!poolHolder) return;
  await poolHolder.pool.end();
  poolHolder = undefined;
}
