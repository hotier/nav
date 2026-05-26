/**
 * 统一查询层 —— 前端页面和后台 API 共用同一套缓存数据源
 *
 * 所有查询经过 SWR 内存缓存，路由切换近乎瞬时。
 * 管理后台 CRUD 操作后调用 invalidate*() 清除对应缓存。
 */
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { swr, invalidateByPrefix, deleteCached } from "@/lib/cache";

// ===================== 分类查询 =====================

export const getCategories = cache(async (userId?: string) => {
  const cacheKey = `categories:${userId || "anon"}`;
  return swr(cacheKey, () => {
    // 与 buildCategoryWhere 对齐：登录用户看公开+自己的，未登录只看公开
    const where: Record<string, unknown> = userId
      ? { OR: [{ isPublic: true }, { userId }] }
      : { isPublic: true };
    return prisma.category.findMany({
      where,
      include: {
        _count: { select: { links: true } },
        children: {
          include: { _count: { select: { links: true } } },
        },
      },
      orderBy: { sortOrder: "asc" },
    });
  },
  5 * 60_000 // TTL 5min — 分类结构变动频率极低
  );
});

// ===================== 链接查询 =====================

export const getAllLinks = cache(async (userId?: string) => {
  const cacheKey = `links:all:${userId || "anon"}`;
  return swr(cacheKey, () => {
    const where: Record<string, unknown> = {};
    if (userId) {
      // 登录后：自己的全部链接 + 别人公开的链接（且所属分类也公开）
      where.OR = [{ userId }, { isPrivate: false, category: { isPublic: true } }];
    } else {
      // 未登录：只看公开链接，且所属分类也是公开的
      where.isPrivate = false;
      where.category = { isPublic: true };
    }
    return prisma.link.findMany({
      where,
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }],
    });
  }, 2 * 60_000);
});

// ===================== 搜索（不缓存——查询变化太频繁） =====================

export async function searchLinks(query: string, userId?: string) {
  const results = await prisma.link.findMany({
    where: {
      AND: [
        // 可见性：登录后看自己的全部 + 别人公开（且所属分类也公开）；未登录只看公开+分类公开
        userId
          ? { OR: [{ userId }, { isPrivate: false, category: { isPublic: true } }] }
          : { isPrivate: false, category: { isPublic: true } },
        // 文本搜索
        {
          OR: [
            { title: { contains: query } },
            { description: { contains: query } },
            { url: { contains: query } },
          ],
        },
      ],
    },
    include: { category: { select: { id: true, name: true } } },
  });

  const q = query.toLowerCase();
  const scored = results
    .map((link) => {
      let score = 0;
      if (link.title.toLowerCase().includes(q)) score += 3;
      if (link.url.toLowerCase().includes(q)) score += 2;
      if (link.description?.toLowerCase().includes(q)) score += 1;
      return { link, score };
    })
    .sort((a, b) => {
      if (a.link.isPinned !== b.link.isPinned) return a.link.isPinned ? -1 : 1;
      return b.score - a.score || a.link.sortOrder - b.link.sortOrder;
    });

  return scored.slice(0, 50).map((s) => s.link);
}

// ===================== 缓存失效 —— 管理后台 CRUD 后调用 =====================

/** 分类发生变更（创建/更新/删除）后调用 */
export function invalidateCategories(): void {
  invalidateByPrefix("categories");
  invalidateByPrefix("category:");
  deleteCached("anon:categories"); // 匿名用户分类缓存
  invalidateByPrefix("links"); // 分类变更影响所有链接的归类展示，必须全清
  invalidateByPrefix("dashboard:stats:"); // 仪表盘统计也需刷新
}

/**
 * 链接发生变更（创建/更新/删除/排序/状态）后调用
 *
 * 精确清除策略：
 *   - 有 categoryId → exact key 删除，只影响该用户在该分类的缓存
 *   - 无 categoryId → prefix 删除（排序/检测等批量操作，无法定位具体分类）
 */
export function invalidateLinks(userId?: string, categoryId?: string): void {
  const keys: string[] = [];

  if (userId) {
    keys.push(`links:all:${userId}`);
    keys.push(`links:dashboard:${userId}`);
    keys.push(`dashboard:stats:${userId}`); // 仪表盘统计也需刷新

    if (categoryId) {
      // ====== 精确清除 ======
      // 1. 该分类的链接列表（含当前用户 + 匿名）
      keys.push(`links:cat:${categoryId}:${userId}`);
      keys.push(`links:cat:${categoryId}:anon`);
      // 2. 精确清除当前用户的管理后台/首页 API 缓存
      invalidateByPrefix(`links:api:mgmt:${userId}:${categoryId}:`);
      invalidateByPrefix(`links:api:mgmt:${userId}:all:`);
      invalidateByPrefix(`links:api:pub:${userId}:${categoryId}:`);
      invalidateByPrefix(`links:api:pub:${userId}:all:`);
      // 3. 链接可见性变更会影响所有能看到的用户 → 清空该分类下所有公开视图缓存
      invalidateByPrefix(`links:api:pub:anon:${categoryId}:`);
      invalidateByPrefix(`links:api:pub:anon:all:`);
      // 其他登录用户的 pub 缓存也一并清除（无法枚举用户，用全量 pub 清理兜底）
      invalidateByPrefix(`links:api:pub:`);
    } else {
      // ====== 批量操作兜底 ======
      // 没有分类信息时，只能清除该用户所有分类 + 所有 API 缓存
      invalidateByPrefix(`links:cat:`);
      invalidateByPrefix(`links:api:mgmt:${userId}`);
      invalidateByPrefix(`links:api:pub:${userId}`);
      invalidateByPrefix(`links:api:pub:anon`);
    }
  } else if (categoryId) {
    // 无用户但有分类（罕见，兜底用 prefix）
    invalidateByPrefix(`links:cat:${categoryId}`);
    invalidateByPrefix(`links:api:pub:anon:${categoryId}`);
  } else {
    // 无用户无分类（如初始状态），清除所有匿名缓存
    invalidateByPrefix(`links:api:pub:anon`);
  }

  // 匿名用户全量链接列表
  keys.push("links:all:anon");

  keys.forEach((k) => deleteCached(k));
}

/** 当链接变更涉及分类转移时，同时失效新旧两个分类的缓存 */
export function invalidateLinksWithOldCategory(
  userId: string,
  oldCategoryId: string,
  newCategoryId: string
): void {
  invalidateLinks(userId, oldCategoryId);
  invalidateLinks(userId, newCategoryId);
}

/** 全量清除（导入/导出等批量操作后） */
export function invalidateAll(): void {
  invalidateByPrefix("");
}

/** 用户管理写操作后失效用户列表缓存 */
export function invalidateUsers(): void {
  deleteCached("users:all");
}

// ===================== 数据表版本号（客户端缓存同步） =====================

/**
 * 表数据变更后递增对应版本号。
 * 版本号存储在 AppSetting 表，key 格式为 "version:TableName"。
 *
 * 客户端通过 GET /api/cache-version?table=X 获取版本号，
 * 与本地缓存版本比对，不一致则重新拉取数据实现跨端同步。
 */
export async function incrementTableVersion(table: string): Promise<number> {
  const keys = [table];

  // "Link" 变更时需要同步递增 "Link:mgmt"（仪表盘管理后台缓存），避免缓存污染
  if (table === "Link") keys.push("Link:mgmt");

  // "Category" 变更时同步递增 "Category:mgmt"（仪表盘分类管理缓存）
  if (table === "Category") keys.push("Category:mgmt");

  // 链接/分类/用户变更 → 联动递增 DashboardStats 版本
  // 服务端 SWR 缓存的清除由 invalidateLinks / invalidateCategories 各自携带 userId 精确处理
  if (table === "Link" || table === "Category" || table === "User") {
    keys.push("DashboardStats");
  }

  let latestVersion = 0;

  for (const t of keys) {
    const key = `version:${t}`;

    // 确保行存在
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: "0" },
      update: {},
    });

    // 原子递增
    await prisma.$executeRaw`
      UPDATE "AppSetting"
      SET "value" = (COALESCE("value"::int, 0) + 1)::text
      WHERE "key" = ${key}
    `;

    // 读取新值
    const setting = await prisma.appSetting.findUnique({ where: { key } });
    const newVersion = parseInt(setting?.value || "0", 10);
    latestVersion = newVersion;

    // 清除 cache-version API 的 SWR 缓存，确保下一次请求拿到最新版本号
    deleteCached(`cache-version:${t}`);
  }

  return latestVersion;
}
