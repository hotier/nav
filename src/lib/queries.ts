/**
 * 统一查询层 —— 前端页面和后台 API 共用同一套缓存数据源
 *
 * 所有查询经过 SWR 内存缓存，路由切换近乎瞬时。
 * 管理后台 CRUD 操作后调用 invalidate*() 清除对应缓存。
 */
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { swr, invalidateByPrefix, deleteCached } from "@/lib/cache";
import {
  categoryKey,
  linkCountKey,
  linkListKey,
  dashboardStatsKey,
  prefixByUser,
  prefixPublicAnon,
  prefixPublicUser,
  prefixCategoryByUser,
} from "@/lib/cache-keys";
import { searchLinks as unifiedSearchLinks } from "@/lib/search";

// ===================== 分类查询 =====================

export const getCategories = cache(async (userId?: string) => {
  const cacheKey = categoryKey(userId, "home");
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

/** 获取可见链接总数（SSR 用，仅 COUNT，不加载完整数据） */
export const getLinkCount = cache(async (userId?: string) => {
  const cacheKey = linkCountKey(userId);
  return swr(cacheKey, () => {
    const where: Record<string, unknown> = {};
    if (userId) {
      where.OR = [{ userId }, { isPrivate: false, category: { isPublic: true } }];
    } else {
      where.isPrivate = false;
      where.category = { isPublic: true };
    }
    return prisma.link.count({ where });
  }, 2 * 60_000);
});

export const getAllLinks = cache(async (userId?: string) => {
  const cacheKey = linkListKey(userId, "home");
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
// 统一转发到 lib/search.ts，规则只有一份真源。

export async function searchLinks(query: string, userId?: string) {
  return unifiedSearchLinks(query, userId);
}

// ===================== 缓存失效 —— 管理后台 CRUD 后调用 =====================

/**
 * 分类发生变更（创建/更新/删除）后调用
 *
 * 清分类键 + 公开链接视图 + 各自用户的仪表盘统计。
 * 登录用户的私有链接缓存不在此暴力清除，而是由 incrementTableVersion("Category")
 * 联动递增 Link 版本号，客户端通过 /api/cache-version 比对后重新拉取（已有跨端同步机制）。
 * 全程使用带 user 维度的前缀，绝不清无 user 维度的 links 前缀。
 */
export function invalidateCategories(userId?: string): void {
  if (userId) {
    invalidateByPrefix(prefixCategoryByUser(userId));
    deleteCached(dashboardStatsKey(userId));
  } else {
    // 无参（分类 CRUD 无特定用户上下文）：清所有用户维度分类前缀
    invalidateByPrefix("categories:v1:user:");
    invalidateByPrefix("dashboard:stats:v1:");
  }
  // 公开分类变更影响公开浏览视图的链接归类展示
  invalidateByPrefix(prefixPublicAnon());
}

/**
 * 链接发生变更（创建/更新/删除/排序/状态）后调用
 *
 * 精确清除策略（基于结构化键前缀，绝不出现无 user 维度的 links 前缀）：
 *   - 该用户全部链接缓存
 *   - 匿名公开视图（任何人未登录看到的公开页）
 *   - 登录用户浏览公开页的 pub 视图（自己登录态）
 *   - 给定 categoryId 时额外精确清该分类在各 scope 的列表键
 *   - 管理员编辑他人链接时，额外清管理员自身的缓存（由调用方传 adminId 触发）
 */
export function invalidateLinks(userId?: string, categoryId?: string): void {
  if (userId) {
    invalidateByPrefix(prefixByUser(userId));
    invalidateByPrefix(prefixPublicAnon());
    invalidateByPrefix(prefixPublicUser(userId));
    if (categoryId) {
      // 精确清该分类在各 scope 的列表键（覆盖 home/manage）
      invalidateByPrefix(linkListKey(userId, "home", categoryId));
      invalidateByPrefix(linkListKey(userId, "manage", categoryId));
      invalidateByPrefix(linkListKey(undefined, "home", categoryId));
    }
  } else if (categoryId) {
    // 无用户但有分类（罕见）：仅清匿名公开视图下该分类
    invalidateByPrefix(linkListKey(undefined, "home", categoryId));
  } else {
    // 无用户无分类：仅清匿名公开视图
    invalidateByPrefix(prefixPublicAnon());
  }
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

  // 客户端所有页面统一比对全量版本号（Link / Category）来判断数据是否过期，
  // 不再需要级联递增 *:mgmt* 版本号（那些只用于缓存 key 隔离，不参与版本比对）。
  // 分类可见性变更会影响链接的可见范围 → 联动递增 Link 全量版本，触发所有链接页面重拉。
  if (table === "Category") {
    keys.push("Link");
  }

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
