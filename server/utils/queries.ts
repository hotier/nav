/**
 * 统一查询层 —— 前端页面和后台 API 共用同一套缓存数据源
 *
 * 缓存策略（Vercel serverless 多实例环境）：
 *   - 版本化缓存键：读路径先 getTableVersion(table) 取数据版本，编进缓存键。
 *     写操作递增版本 → 所有实例的旧键天然失效，无需主动清除。
 *   - 版本号读取禁止缓存：它是缓存键的构造依据，缓存它会拿到旧键→旧数据。
 *   - 数据写入与版本号递增必须在同一事务里（见 incrementTableVersion 的 tx 参数），
 *     否则可能出现「数据已提交、版本未递增」的窗口，读到旧缓存。
 *   - 权限条件统一复用 permissions.ts 真源（buildCategoryWhere / buildLinkWhere），
 *     本文件不再手写复制可见性条件。
 */
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { getDb, rowsOf, type DbExecutor } from "./db";
import { swr } from "./cache";
import {
  categoryKey,
  linkCountKey,
  linkListKey,
  dashboardStatsKey,
} from "./cache-keys";
import { buildCategoryWhere, buildLinkWhere } from "./permissions";
import { appSettings, categories, links } from "~~/server/database/schema";

export type CategoryRow = typeof categories.$inferSelect;
export type LinkRow = typeof links.$inferSelect;
export type LinkWithCategory = LinkRow & {
  category: Pick<CategoryRow, "id" | "name" | "icon">;
};
export type CategoryTreeNode = CategoryRow & {
  _count: { links: number };
  children: CategoryTreeNode[];
};

// ===================== 数据表版本号 =====================

/**
 * 读取某表的当前数据版本号（版本化缓存键的构造依据）。
 *
 * - 直查 DB，不做任何缓存（必须，原因见文件头注释）。
 * - miss 返回 0（首读未写过时），键 ver0 与 increment 后的 ver1 天然区分。
 */
export async function getTableVersion(table: string): Promise<number> {
  const rows = await getDb()
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, `version:${table}`))
    .limit(1);
  return parseInt(rows[0]?.value || "0", 10) || 0;
}

/**
 * 表数据变更后递增对应版本号（写路径调用方必须 await）。
 *
 * 单条原子 SQL：不存在则创建，存在则 +1，并返回新值。
 * 必须与业务写入传入同一个事务客户端（tx），保证「数据提交」与「版本翻页」原子。
 *
 * 联动规则：
 *   - Category 变更影响链接可见范围 → 联动递增 Link
 *   - User 变更（改名/删号）影响链接的创建人展示与级联删除 → 联动递增 Link
 *   - Link/Category/User 变更 → 联动递增 DashboardStats（stats 缓存键随之翻页）
 */
export async function incrementTableVersion(
  table: string,
  db: DbExecutor = getDb(),
): Promise<number> {
  const keys = [table];
  if (table === "Category" || table === "User") keys.push("Link");
  if (table === "Link" || table === "Category" || table === "User") {
    keys.push("DashboardStats");
  }

  let latestVersion = 0;
  for (const t of keys) {
    const key = `version:${t}`;
    const result = await db.execute(sql`
      INSERT INTO "AppSetting" ("key", "value")
      VALUES (${key}, '1')
      ON CONFLICT ("key")
      DO UPDATE SET "value" = (COALESCE("AppSetting"."value"::int, 0) + 1)::text
      RETURNING "value"
    `);
    const v = parseInt(rowsOf<{ value: string }>(result)[0]?.value || "0", 10);
    if (!Number.isNaN(v)) latestVersion = v;
  }
  return latestVersion;
}

// ===================== 分类查询 =====================

export async function getCategories(userId?: string): Promise<CategoryTreeNode[]> {
  const version = await getTableVersion("Category");
  const cacheKey = categoryKey(version, userId, "home");
  return swr(
    cacheKey,
    async () => {
      const db = getDb();
      const where = buildCategoryWhere(userId);
      const [rows, counts] = await Promise.all([
        db
          .select()
          .from(categories)
          .where(where)
          .orderBy(asc(categories.sortOrder)),
        db
          .select({ categoryId: links.categoryId, value: count() })
          .from(links)
          .groupBy(links.categoryId),
      ]);

      const countMap = new Map(counts.map((c) => [c.categoryId, Number(c.value)]));
      const nodes = rows.map((row) => ({
        ...row,
        _count: { links: countMap.get(row.id) ?? 0 },
        children: [] as CategoryTreeNode[],
      }));
      const byId = new Map(nodes.map((node) => [node.id, node]));

      // 与 Prisma include.children 行为一致：所有匹配分类都在顶层，同时挂上子节点
      for (const node of nodes) {
        if (node.parentId) byId.get(node.parentId)?.children.push(node);
      }
      return nodes;
    },
    5 * 60_000, // TTL 5min — 分类结构变动频率极低（正确性由版本键保证，TTL 只是兜底）
  );
}

// ===================== 链接查询 =====================

/** 获取可见链接总数（SSR 用，仅 COUNT，不加载完整数据） */
export async function getLinkCount(userId?: string) {
  const version = await getTableVersion("Link");
  const cacheKey = linkCountKey(version, userId);
  return swr(
    cacheKey,
    async () => {
      const rows = await getDb()
        .select({ value: count() })
        .from(links)
        .where(buildLinkWhere("home", userId));
      return Number(rows[0]?.value ?? 0);
    },
    2 * 60_000,
  );
}

export async function getAllLinks(userId?: string): Promise<LinkWithCategory[]> {
  const version = await getTableVersion("Link");
  const cacheKey = linkListKey(version, userId, "home");
  return swr(
    cacheKey,
    async () => {
      const rows = await getDb()
        .select({
          link: links,
          category: {
            id: categories.id,
            name: categories.name,
            icon: categories.icon,
          },
        })
        .from(links)
        .innerJoin(categories, eq(links.categoryId, categories.id))
        .where(buildLinkWhere("home", userId))
        .orderBy(desc(links.isPinned), asc(links.sortOrder), asc(links.createdAt));
      return rows.map((row) => ({ ...row.link, category: row.category }));
    },
    2 * 60_000,
  );
}

// ===================== 仪表盘统计键 =====================

/** 仪表盘 stats 的版本化缓存键（随 Link 数据版本翻页） */
export function statsKeyFor(userId: string): Promise<string> {
  return getTableVersion("DashboardStats").then((v) => dashboardStatsKey(v, userId));
}
