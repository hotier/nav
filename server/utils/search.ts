/**
 * 统一搜索深层模块
 *
 * 搜索的「可见性 + 文本匹配 + 打分排序」规则只有这一份真源：
 *   - api/search/index.get.ts (GET)
 *   - api/search/index.post.ts (POST，供 AI/组合搜索)
 *   - utils/queries.ts
 * 都调用本模块，避免两处各维护一套导致 AI 搜索与规则搜索结果不一致。
 *
 * 可见性基底复用 permissions.buildLinkWhere，确保与全站权限口径一致。
 */

import { and, asc, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { getDb } from "./db";
import { buildLinkWhere, type LinkViewScope } from "./permissions";
import { categories, links } from "~~/server/database/schema";
import { linkColumns } from "~~/server/database/link-columns";
import type { CategoryRow, LinkRow } from "./queries";

export type SearchOptions = {
  scope?: LinkViewScope; // 默认 "home"
  limit?: number; // 默认 50
};

export type SearchLink = LinkRow & { category: CategoryRow };

/** 转义 LIKE 通配符，避免用户输入 % / _ 改变匹配语义 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/**
 * 生成搜索条件：可见性基底（buildLinkWhere）AND 文本 OR 匹配。
 */
export function buildSearchWhere(
  userId: string | undefined,
  userRole: string | undefined,
  q: string,
): SQL | undefined {
  const query = q.trim();
  const visibility = buildLinkWhere("home", userId, userRole);
  if (!query) return visibility;
  const pattern = `%${escapeLike(query)}%`;
  const textFilter = or(
    ilike(links.title, pattern),
    ilike(links.url, pattern),
    ilike(links.description, pattern),
  );
  return and(visibility, textFilter);
}

/**
 * 纯函数打分排序：不触碰数据库，可单测。
 * 权重：title +3 / url +2 / description +1；置顶(isPinned)优先；同分稳定。
 */
export function scoreAndSort<T extends Pick<LinkRow, "title" | "url" | "description" | "isPinned" | "sortOrder">>(
  links: T[],
  q: string,
): T[] {
  const query = q.trim().toLowerCase();
  const scored = links.map((link) => {
    let score = 0;
    if (query) {
      const title = (link.title ?? "").toLowerCase();
      const url = (link.url ?? "").toLowerCase();
      const desc = (link.description ?? "").toLowerCase();
      if (title.includes(query)) score += 3;
      if (url.includes(query)) score += 2;
      if (desc.includes(query)) score += 1;
    }
    return { link, score };
  });
  scored.sort((a, b) => {
    if (a.link.isPinned && !b.link.isPinned) return -1;
    if (!a.link.isPinned && b.link.isPinned) return 1;
    if (b.score !== a.score) return b.score - a.score;
    return (a.link.sortOrder ?? 0) - (b.link.sortOrder ?? 0);
  });
  return scored.map((s) => s.link);
}

/**
 * 组合：可见性条件 → 取全部候选 → 纯函数打分排序 → 截断到 limit。
 */
export async function searchLinks(
  q: string,
  userId?: string,
  userRole?: string,
  opts?: SearchOptions,
): Promise<SearchLink[]> {
  const limit = opts?.limit ?? 50;
  const where = buildSearchWhere(userId, userRole, q);
  const rows = await getDb()
    .select({ link: linkColumns, category: categories })
    .from(links)
    .innerJoin(categories, eq(links.categoryId, categories.id))
    .where(where)
    .orderBy(desc(links.isPinned), asc(links.sortOrder), asc(links.createdAt));
  const sorted = scoreAndSort(
    rows.map((row) => ({ ...row.link, category: row.category })),
    q,
  );
  return sorted.slice(0, limit);
}
