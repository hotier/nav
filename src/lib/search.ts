/**
 * 统一搜索深层模块
 *
 * 搜索的「可见性 + 文本匹配 + 打分排序」规则只有这一份真源：
 *   - api/search/route.ts (GET/POST)
 *   - lib/queries.ts (searchLinks)
 * 都调用本模块，避免两处各维护一套导致 AI 搜索与规则搜索结果不一致。
 *
 * 可见性基底复用 permissions.buildLinkWhere，确保与全站权限口径一致。
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildLinkWhere, type LinkViewScope } from "@/lib/permissions";

export type SearchOptions = {
  scope?: LinkViewScope; // 默认 "home"
  limit?: number; // 默认 50
};

/**
 * 生成搜索的 Prisma where：可见性基底（buildLinkWhere）AND 文本 OR 匹配。
 * 纯函数（除调用 buildLinkWhere），无副作用。
 */
export function buildSearchWhere(
  userId: string | undefined,
  userRole: string | undefined,
  q: string,
): Prisma.LinkWhereInput {
  const query = q.trim();
  const visibility = buildLinkWhere("home", userId, userRole);
  if (!query) return visibility;
  const textFilter: Prisma.LinkWhereInput = {
    OR: [
      { title: { contains: query, mode: "insensitive" } },
      { url: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
    ],
  };
  return { AND: [visibility, textFilter] };
}

/**
 * 纯函数打分排序：不触碰数据库，可单测。
 * 权重：title +3 / url +2 / description +1；置顶(isPinned)优先；同分稳定。
 */
export function scoreAndSort(links: Array<Prisma.LinkGetPayload<object>>, q: string): Array<Prisma.LinkGetPayload<object>> {
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
 * 组合：可见性 where → 取全部候选 → 纯函数打分排序 → 截断到 limit。
 */
export async function searchLinks(
  q: string,
  userId?: string,
  userRole?: string,
  opts?: SearchOptions,
): Promise<Array<Prisma.LinkGetPayload<object>>> {
  const scope = opts?.scope ?? "home";
  const limit = opts?.limit ?? 50;
  const where = buildSearchWhere(userId, userRole, q);
  const links = await prisma.link.findMany({
    where,
    include: { category: true },
    orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }],
  });
  const sorted = scoreAndSort(links, q);
  return sorted.slice(0, limit);
}
