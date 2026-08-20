/**
 * 结构化缓存键生成器
 *
 * 所有服务端缓存键集中在此生成，确保「写入失效」与「读取键」始终对称，
 * 避免散落手写字符串导致的越权残留（跨用户命中彼此私有缓存）。
 *
 * 键结构约定：
 *   links:v1:user:{uid|anon}:{scopeKey}:{catId|all}:p{page}:{sort}
 *   categories:v1:user:{uid|anon}:{scopeKey}
 *   links:count:v1:user:{uid|anon}
 *   dashboard:stats:v1:{userId}
 *
 * 失效不变量：任何失效操作都带有 user 维度前缀，绝不出现无 user 维度的 `links` 前缀。
 */

import type { LinkViewScope } from "@/lib/permissions";
import { cacheScope } from "@/lib/permissions";

/** 归一化 userId：未登录统一为 "anon" */
function normUid(userId: string | undefined): string {
  return userId || "anon";
}

/** 链接列表键（GET /api/links 的 SWR 键） */
export function linkListKey(
  userId: string | undefined,
  scope: LinkViewScope,
  categoryId?: string | null,
  page: number = 1,
  sort: string = "sortOrder",
): string {
  const uid = normUid(userId);
  const scopeKey = cacheScope(scope);
  const cat = categoryId || "all";
  return `links:v1:user:${uid}:${scopeKey}:${cat}:p${page}:${sort}`;
}

/** 分类列表键（GET /api/categories 的 SWR 键） */
export function categoryKey(userId: string | undefined, scope: LinkViewScope): string {
  const uid = normUid(userId);
  const scopeKey = cacheScope(scope);
  return `categories:v1:user:${uid}:${scopeKey}`;
}

/** 链接计数键（getLinkCount） */
export function linkCountKey(userId: string | undefined): string {
  return `links:count:v1:user:${normUid(userId)}`;
}

/** 仪表盘统计键 */
export function dashboardStatsKey(userId: string): string {
  return `dashboard:stats:v1:${userId}`;
}

/** 某用户全部链接缓存前缀（用于失效） */
export function prefixByUser(userId: string | undefined): string {
  return `links:v1:user:${normUid(userId)}:`;
}

/** 匿名公开视图前缀（失效公开页缓存） */
export function prefixPublicAnon(): string {
  return `links:v1:user:anon:`;
}

/** 登录用户浏览公开页的前缀（自己登录态下的 pub 视图） */
export function prefixPublicUser(userId: string): string {
  return `links:v1:user:pub:${userId}:`;
}

/** 分类缓存前缀（含 anon / 指定用户） */
export function prefixCategoryByUser(userId: string | undefined): string {
  return `categories:v1:user:${normUid(userId)}:`;
}
