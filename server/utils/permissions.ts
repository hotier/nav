/**
 * 权限中间件 — 统一管理链接的可见性规则
 *
 * 所有需要判断"某个用户能看到哪些链接"的地方，统一走这里。
 * 包括 API where 条件、统计口径、客户端过滤等。
 */

import { and, eq, or, sql, type SQL } from "drizzle-orm";
import { createError } from "h3";
import { categories, links } from "~~/server/database/schema";

/** 会话用户（与 server/utils/session 的 SessionUser 结构一致，避免循环依赖） */
export interface SessionUserLike {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string | null;
}

export interface SessionLike {
  user: SessionUserLike;
}

/**
 * 视图场景
 * - "home": 首页/分类页，展示给所有用户的公开内容
 * - "manage": 管理后台，仅展示当前用户有管理权限的链接
 */
export type LinkViewScope = "home" | "manage";

/** 调用方直接调用；未登录抛 401，非管理员抛 403 */
export function adminOnly(session: SessionLike | null): void {
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, statusMessage: "未登录" });
  }
  if (session.user.role !== "admin") {
    throw createError({ statusCode: 403, statusMessage: "无权操作，仅管理员可执行" });
  }
}

/**
 * 根据用户身份，生成分类查询条件。
 *
 * 权限规则：
 * - 管理员 manage/home：公开分类 + 自己创建的私有分类（含被隐藏的，便于管理/解除隐藏）
 *   —— 普通用户主动设为私有的分类对管理员不可见
 * - 普通用户：公开分类（未隐藏）+ 自己创建的分类（未隐藏）
 * - 未登录：只看公开且未隐藏的分类
 */
export function buildCategoryWhere(
  userId: string | undefined,
  scope: LinkViewScope = "home",
  userRole?: string,
): SQL | undefined {
  if (userRole === "admin" && scope === "manage") {
    // 公开（含隐藏）+ 自己的私有
    return userId ? or(eq(categories.isPublic, true), eq(categories.userId, userId)) : eq(categories.isPublic, true);
  }
  if (!userId) {
    return and(eq(categories.isPublic, true), eq(categories.isHidden, false));
  }
  if (userRole === "admin") {
    // 管理员 home：不过滤隐藏（链接管理页数据源为 home 视野，管理员需能看到隐藏内容）
    return or(eq(categories.isPublic, true), eq(categories.userId, userId));
  }
  // 普通用户：排除被管理员隐藏的内容
  return and(eq(categories.isHidden, false), or(eq(categories.isPublic, true), eq(categories.userId, userId)));
}

/**
 * 检查当前用户是否能编辑/删除某个分类；无权限时抛 401/403。
 *
 * 规则：
 * - 管理员：可管理任意公开分类 + 自己创建的私有分类（不能管理他人私有分类）
 * - 普通用户：只能操作自己创建的分类（公开/私有均可——普通用户有权创建公开分类）
 * - 未登录：无权操作
 */
export function assertCanManageCategory(
  session: SessionLike | null,
  category: { userId: string | null; isPublic: boolean },
): void {
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, statusMessage: "未登录" });
  }
  if (session.user.role === "admin") {
    // 管理员：可管理公开分类（任意创建者）+ 自己创建的私有分类
    if (category.isPublic) return;
    if (category.userId === session.user.id) return;
    throw createError({ statusCode: 403, statusMessage: "无权操作其他用户的私有分类" });
  }
  if (category.userId !== session.user.id) {
    throw createError({ statusCode: 403, statusMessage: "无权操作此分类" });
  }
}

/**
 * 检查当前用户是否可以往某个分类添加链接；无权限时抛 401/403。
 *
 * 规则：
 * - 公开分类（isPublic: true）：任意登录用户可添加
 * - 私有分类：仅创建者可以添加
 * - 管理员：任意分类可添加
 * - 被隐藏的分类：仅管理员可添加（普通用户不可见）
 */
export function assertCanAddLinkToCategory(
  session: SessionLike | null,
  category: { userId: string | null; isPublic: boolean; isHidden?: boolean },
): void {
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, statusMessage: "未登录" });
  }
  if (session.user.role === "admin") return;
  if (category.isHidden) {
    throw createError({ statusCode: 403, statusMessage: "该分类已被管理员隐藏，无权添加链接" });
  }
  // 公开分类 → 任何登录用户可写入
  if (category.isPublic) return;
  // 私有分类 → 仅创建者可写入
  if (category.userId === session.user.id) return;
  throw createError({ statusCode: 403, statusMessage: "无权向此分类添加链接" });
}

/** 关联分类子查询：predicate 使用 "cat" 别名 */
function categoryExists(predicate: SQL): SQL {
  return sql`exists (select 1 from "Category" "cat" where "cat"."id" = ${links.categoryId} and ${predicate})`;
}

/**
 * 根据用户身份和视图场景，生成链接查询条件。
 *
 * 权限规则：
 * | 场景    | 用户身份       | 可见范围                          |
 * |--------|--------------|----------------------------------|
 * | home   | 未登录         | 公开链接（且所属分类公开、均未隐藏） |
 * | home   | 管理员         | 自己的全部 + 别人的公开（含隐藏内容）|
 * | home   | 普通用户       | 自己的全部 + 别人的公开 + 自己分类下的他人公开（均排除隐藏）|
 * | manage | 管理员         | 自己的全部 + 别人的公开（含隐藏内容）|
 * | manage | 普通用户       | 仅自己的全部（排除被隐藏的）       |
 */
export function buildLinkWhere(
  scope: LinkViewScope,
  userId: string | undefined,
  userRole?: string,
): SQL | undefined {
  if (!userId) {
    // 未登录 → 只看公开链接，且所属分类也是公开的（均未隐藏）
    return and(
      eq(links.isPrivate, false),
      eq(links.isHidden, false),
      categoryExists(sql`"cat"."isPublic" = true and "cat"."isHidden" = false`),
    );
  }

  // 普通用户的管理后台 → 仅自己的（排除被隐藏的）
  if (scope === "manage" && userRole !== "admin") {
    return and(eq(links.userId, userId), eq(links.isHidden, false));
  }

  // 管理员（任意场景）：自己的全部 + 别人的公开（含隐藏内容，便于管理/解除隐藏）
  if (userRole === "admin") {
    return or(
      eq(links.userId, userId),
      and(eq(links.isPrivate, false), categoryExists(sql`"cat"."isPublic" = true`)),
    );
  }

  // 登录普通用户 home：自己的全部 + 别人的公开（均排除隐藏）
  return or(
    // 自己的全部
    and(eq(links.userId, userId), eq(links.isHidden, false)),
    // 他人的公开链接，且其所属分类是公开的
    and(
      eq(links.isPrivate, false),
      eq(links.isHidden, false),
      categoryExists(sql`"cat"."isPublic" = true and "cat"."isHidden" = false`),
    ),
    // 我创建的分类下的他人公开链接（分类私有化后对创建者仍可见，数量不跳变）
    and(
      eq(links.isPrivate, false),
      eq(links.isHidden, false),
      categoryExists(sql`"cat"."userId" = ${userId} and "cat"."isHidden" = false`),
    ),
  );
}

/**
 * 根据用户身份和视图场景，生成统计口径的条件。
 * 与 buildLinkWhere 一致。
 */
export function buildStatsWhere(
  scope: LinkViewScope,
  userId: string | undefined,
  userRole?: string,
): SQL | undefined {
  return buildLinkWhere(scope, userId, userRole);
}

/** 生成缓存键中的 scope 标识 */
export function cacheScope(scope: LinkViewScope): string {
  return scope === "manage" ? "mgmt" : "pub";
}
