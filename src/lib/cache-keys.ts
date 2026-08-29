/**
 * 结构化缓存键生成器（版本化键 / generation-token 方案）
 *
 * 设计（Vercel serverless 多实例环境）：
 *   - 失效不靠前缀清除（跨实例不可行），靠「数据版本号编进键」：
 *     版本递增 → 所有实例天然 miss → 查 DB 新数据；旧键成孤儿，随实例回收/TTL 消亡。
 *   - 版本号存 DB（AppSetting: version:{Table}），跨实例天然正确。
 *     读取入口：queries.getTableVersion（直查 DB，禁止缓存——旧版本号会导致旧键→旧数据）。
 *   - 本模块保持纯函数，无 IO。
 *
 * 键结构约定：
 *   links:v3:ver{N}:user:{uid|anon}:{pub|mgmt}:{catId|all}:p{page}:{sort}
 *   categories:v4:ver{N}:user:{uid|anon}:{pub|mgmt}
 *   links:count:v3:ver{N}:user:{uid|anon}
 *   dashboard:stats:v2:ver{N}:{userId}
 *
 * 不变量：任何键都带 ver 段；任何写操作必须 await incrementTableVersion（写路径）。
 */

import type { LinkViewScope } from "@/lib/permissions";
import { cacheScope } from "@/lib/permissions";

/** 归一化 userId：未登录统一为 "anon" */
function normUid(userId: string | undefined): string {
  return userId || "anon";
}

/** 链接列表键（GET /api/links 的 SWR 键） */
export function linkListKey(
  version: number,
  userId: string | undefined,
  scope: LinkViewScope,
  categoryId?: string | null,
  page: number = 1,
  sort: string = "sortOrder",
): string {
  const uid = normUid(userId);
  const scopeKey = cacheScope(scope);
  const cat = categoryId || "all";
  return `links:v3:ver${version}:user:${uid}:${scopeKey}:${cat}:p${page}:${sort}`;
}

/** 分类列表键（GET /api/categories 的 SWR 键）
 *  v3：权限规则变更（管理员不再可见普通用户私有分类）后 bump，使旧缓存失效 */
export function categoryKey(version: number, userId: string | undefined, scope: LinkViewScope): string {
  const uid = normUid(userId);
  const scopeKey = cacheScope(scope);
  return `categories:v4:ver${version}:user:${uid}:${scopeKey}`;
}

/** 链接计数键（getLinkCount） */
export function linkCountKey(version: number, userId: string | undefined): string {
  return `links:count:v3:ver${version}:user:${normUid(userId)}`;
}

/** 仪表盘统计键（随 Link 数据版本翻页，DashboardStats 版本由 incrementTableVersion 联动维护） */
export function dashboardStatsKey(version: number, userId: string): string {
  return `dashboard:stats:v2:ver${version}:${userId}`;
}
