/**
 * 统一查询层 —— 前端页面和后台 API 共用同一套缓存数据源
 *
 * 缓存策略（Vercel serverless 多实例环境）：
 *   - 版本化缓存键：读路径先 getTableVersion(table) 取数据版本，编进 SWR 键。
 *     写操作递增版本 → 所有实例的旧键天然失效，无需主动清除（invalidate* 已删除）。
 *   - 版本号读取禁止缓存：它是缓存键的构造依据，缓存它会拿到旧键→旧数据。
 *   - 权限 where 统一复用 permissions.ts 真源（buildCategoryWhere / buildLinkWhere），
 *     本文件不再手写复制可见性条件。
 */
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { swr } from "@/lib/cache";
import {
  categoryKey,
  linkCountKey,
  linkListKey,
  dashboardStatsKey,
} from "@/lib/cache-keys";
import { buildCategoryWhere, buildLinkWhere } from "@/lib/permissions";
import { searchLinks as unifiedSearchLinks } from "@/lib/search";

// ===================== 数据表版本号 =====================

/**
 * 读取某表的当前数据版本号（版本化缓存键的构造依据）。
 *
 * - 直查 DB，不做任何缓存（必须，原因见文件头注释）。
 * - miss 返回 0（首读未写过时），键 ver0 与 increment 后的 ver1 天然区分。
 */
export async function getTableVersion(table: string): Promise<number> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: `version:${table}` },
    select: { value: true },
  });
  return parseInt(setting?.value || "0", 10) || 0;
}

/**
 * 表数据变更后递增对应版本号（写路径调用方必须 await）。
 *
 * 单条原子 SQL：不存在则创建，存在则 +1，并返回新值。
 * 联动规则：
 *   - Category 变更影响链接可见范围 → 联动递增 Link
 *   - User 变更（改名/删号）影响链接的创建人展示与级联删除 → 联动递增 Link
 *   - Link/Category/User 变更 → 联动递增 DashboardStats（stats 缓存键随之翻页）
 */
export async function incrementTableVersion(table: string): Promise<number> {
  const keys = [table];
  if (table === "Category" || table === "User") keys.push("Link");
  if (table === "Link" || table === "Category" || table === "User") {
    keys.push("DashboardStats");
  }

  let latestVersion = 0;
  for (const t of keys) {
    const key = `version:${t}`;
    const rows = await prisma.$queryRaw<{ value: string }[]>`
      INSERT INTO "AppSetting" ("key", "value")
      VALUES (${key}, '1')
      ON CONFLICT ("key")
      DO UPDATE SET "value" = (COALESCE("AppSetting"."value"::int, 0) + 1)::text
      RETURNING "value"
    `;
    const v = parseInt(rows[0]?.value || "0", 10);
    if (!Number.isNaN(v)) latestVersion = v;
  }
  return latestVersion;
}

// ===================== 分类查询 =====================

export const getCategories = cache(async (userId?: string) => {
  const version = await getTableVersion("Category");
  const cacheKey = categoryKey(version, userId, "home");
  return swr(cacheKey, () => {
    // 权限真源：登录用户看公开+自己的，未登录只看公开
    return prisma.category.findMany({
      where: buildCategoryWhere(userId) as Record<string, unknown>,
      include: {
        _count: { select: { links: true } },
        children: {
          where: buildCategoryWhere(userId),
          include: { _count: { select: { links: true } } },
        },
      },
      orderBy: { sortOrder: "asc" },
    });
  },
  5 * 60_000 // TTL 5min — 分类结构变动频率极低（正确性由版本键保证，TTL 只是兜底）
  );
});

// ===================== 链接查询 =====================

/** 获取可见链接总数（SSR 用，仅 COUNT，不加载完整数据） */
export const getLinkCount = cache(async (userId?: string) => {
  const version = await getTableVersion("Link");
  const cacheKey = linkCountKey(version, userId);
  return swr(cacheKey, () => {
    // 权限真源：home 视野
    return prisma.link.count({
      where: buildLinkWhere("home", userId) as Record<string, unknown>,
    });
  }, 2 * 60_000);
});

export const getAllLinks = cache(async (userId?: string) => {
  const version = await getTableVersion("Link");
  const cacheKey = linkListKey(version, userId, "home");
  return swr(cacheKey, () => {
    // 权限真源：home 视野（自己的全部 + 他人公开且分类公开）
    return prisma.link.findMany({
      where: buildLinkWhere("home", userId) as Record<string, unknown>,
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }, 2 * 60_000);
});

// ===================== 搜索（不缓存——查询变化太频繁） =====================
// 统一转发到 lib/search.ts，规则只有一份真源。

export async function searchLinks(query: string, userId?: string) {
  return unifiedSearchLinks(query, userId);
}

// ===================== 仪表盘统计键 =====================

/** 仪表盘 stats 的版本化缓存键（随 Link 数据版本翻页） */
export function statsKeyFor(userId: string): Promise<string> {
  return getTableVersion("DashboardStats").then((v) => dashboardStatsKey(v, userId));
}
