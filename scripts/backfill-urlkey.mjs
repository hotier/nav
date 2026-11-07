/**
 * 一次性修复脚本：为生产库补上 `Link.urlKey`（schema 已声明但库中缺失）。
 *
 * 背景：drizzle 基线 `0000_baseline.sql` 含 `urlKey` 列与唯一索引，但目标库实际没有该列，
 * 导致所有 `select ... "Link"."urlKey"` 的读路径 500（列表/搜索/导出/分类页链接全挂）。
 *
 * 步骤：
 *   1. 缺列则 ADD COLUMN（可空）
 *   2. 按 `linkUrlKey()` 同口径回填（cleanUrl → 去尾斜杠 → 小写）
 *   3. 同用户内 urlKey 重复时追加 `#2`、`#3` 后缀（保留最早一条不动）
 *   4. SET NOT NULL
 *   5. 创建唯一索引 `Link_userId_urlKey_key`（已存在则跳过）
 *
 * 幂等：重复执行只做缺失的部分。
 * 用法：node scripts/backfill-urlkey.mjs
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("缺少 DATABASE_URL");
const sql = neon(url);

/** 与 server/utils/recognize-url.ts 的 cleanUrl 保持同口径 */
function cleanUrl(raw) {
  if (!raw) return "";
  let u = String(raw)
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
  const protoEnd = u.indexOf("://");
  if (protoEnd !== -1) {
    const rest = u.slice(protoEnd + 3).replace(/\/+$/, "");
    u = u.slice(0, protoEnd + 3) + rest;
  }
  return u;
}

function linkUrlKey(raw) {
  return cleanUrl(raw).toLowerCase();
}

const cols = await sql`
  select column_name from information_schema.columns
  where table_name = 'Link'
`;
const hasUrlKey = cols.some((c) => c.column_name === "urlKey");
console.log(`[1/5] urlKey 列存在: ${hasUrlKey}`);

if (!hasUrlKey) {
  await sql`alter table "Link" add column "urlKey" text`;
  console.log("[1/5] 已 ADD COLUMN urlKey");
}

const rows = await sql`select id, url, "userId", "urlKey" from "Link"`;
console.log(`[2/5] 待回填 ${rows.length} 行`);

const taken = new Map(); // `${userId}::${key}` -> id
for (const r of rows) {
  if (r.urlKey) taken.set(`${r.userId}::${r.urlKey}`, r.id);
}

let filled = 0;
let suffixed = 0;
for (const r of rows) {
  if (r.urlKey) continue;
  const base = linkUrlKey(r.url);
  let key = base || `__empty__${r.id}`;
  let n = 1;
  while (taken.has(`${r.userId}::${key}`)) {
    n += 1;
    key = `${base}#${n}`;
    if (n > 50) {
      key = `${base}#${r.id}`;
      break;
    }
  }
  if (n > 1) suffixed += 1;
  taken.set(`${r.userId}::${key}`, r.id);
  await sql`update "Link" set "urlKey" = ${key} where id = ${r.id}`;
  filled += 1;
}
console.log(`[3/5] 已回填 ${filled} 行（其中重名加后缀 ${suffixed} 行）`);

await sql`alter table "Link" alter column "urlKey" set not null`;
console.log("[4/5] 已 SET NOT NULL");

const idx = await sql`
  select indexname from pg_indexes
  where tablename = 'Link' and indexname = 'Link_userId_urlKey_key'
`;
if (idx.length === 0) {
  await sql`create unique index "Link_userId_urlKey_key" on "Link" ("userId", "urlKey")`;
  console.log("[5/5] 已创建唯一索引 Link_userId_urlKey_key");
} else {
  console.log("[5/5] 唯一索引已存在，跳过");
}

const check = await sql`select count(*)::int as n from "Link" where "urlKey" is null`;
console.log("完成。urlKey 为空的行数:", check[0].n);
