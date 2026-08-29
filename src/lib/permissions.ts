/**
 * 权限中间件 — 统一管理链接的可见性规则
 *
 * 所有需要判断"某个用户能看到哪些链接"的地方，统一走这里。
 * 包括 API where 条件、统计口径、客户端过滤等。
 */

import type { Prisma } from "@prisma/client";
import type { Session } from "next-auth";
import { NextResponse } from "next/server";

/**
 * 视图场景
 * - "home": 首页/分类页，展示给所有用户的公开内容
 * - "manage": 管理后台，仅展示当前用户有管理权限的链接
 */
export type LinkViewScope = "home" | "manage";

/**
 * 检查当前会话是否具有管理员权限。
 * 若未登录或不是 admin，直接返回 403 JSON Response，调用方直接 return 即可。
 */
export function adminOnly(session: Session | null): NextResponse | null {
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role;
  if (role !== "admin") {
    return NextResponse.json({ error: "无权操作，仅管理员可执行" }, { status: 403 });
  }
  return null; // 通过检查
}

/**
 * 根据用户身份，生成分类查询的 Prisma where 条件。
 *
 * 权限规则：
 * - 管理员：看所有分类
 * - 普通用户：看公开分类（isPublic: true）+ 自己创建的私有分类（userId: 自己）
 * - 未登录：只看公开分类
 */
export function buildCategoryWhere(
  userId: string | undefined,
): Prisma.CategoryWhereInput {
  if (!userId) {
    return { isPublic: true } as unknown as Prisma.CategoryWhereInput; // 未登录只看公开
  }
  // 登录用户（含管理员）：公开分类 + 自己创建的私有分类
  return { OR: [{ isPublic: true }, { userId }] } as unknown as Prisma.CategoryWhereInput;
}

/**
 * 检查当前用户是否能编辑/删除某个分类。
 *
 * 规则：
 * - 管理员：可以操作任意分类
 * - 普通用户：只能操作自己创建的、非公开（isPublic: false）的分类
 * - 未登录：无权操作
 *
 * 返回 null 表示通过，返回 NextResponse 表示拒绝。
 */
export function canManageCategory(
  session: Session | null,
  category: { userId: string | null; isPublic: boolean },
): NextResponse | null {
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role;
  if (role === "admin") {
    // 管理员：可管理公开分类（任意创建者）+ 自己创建的私有分类
    // 不能管理其他用户的私有分类
    if (category.isPublic) return null;
    if (category.userId === session.user.id) return null;
    return NextResponse.json({ error: "无权操作其他用户的私有分类" }, { status: 403 });
  }
  // 普通用户：只能操作自己创建的分类（普通用户无法创建公开分类，但做防御性检查）
  if (category.userId !== session.user.id) {
    return NextResponse.json({ error: "无权操作此分类" }, { status: 403 });
  }
  return null;
}

/**
 * 检查当前用户是否可以往某个分类添加链接。
 *
 * 规则：
 * - 公开分类（isPublic: true）：任意登录用户可添加
 * - 私有分类：仅创建者可以添加
 * - 管理员：任意分类可添加
 */
export function canAddLinkToCategory(
  session: Session | null,
  category: { userId: string | null; isPublic: boolean },
): NextResponse | null {
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role;
  if (role === "admin") return null;
  // 公开分类 → 任何登录用户可写入
  if (category.isPublic) return null;
  // 私有分类 → 仅创建者可写入
  if (category.userId === session.user.id) return null;
  return NextResponse.json({ error: "无权向此分类添加链接" }, { status: 403 });
}

/**
 * 根据用户身份和视图场景，生成 Prisma where 条件。
 *
 * 权限规则：
 * | 场景    | 用户身份       | 可见范围                          |
 * |--------|--------------|----------------------------------|
 * | home   | 未登录         | 公开链接（且所属分类公开）          |
 * | home   | 管理员/普通用户 | 自己的全部 + 别人的公开（且分类公开）|
 * | manage | 管理员         | 自己的全部 + 别人的公开（且分类公开）|
 * | manage | 普通用户       | 仅自己的全部（公开+私人）         |
 *
 * 注：home 与 manage 对管理员规则相同（合并实现）；
 *     私有分类下的链接一律视作私有，不会对非所有者公开。
 */
export function buildLinkWhere(
  scope: LinkViewScope,
  userId: string | undefined,
  userRole?: string,
): Prisma.LinkWhereInput {
  if (!userId) {
    // 未登录 → 只看公开链接，且所属分类也是公开的
    return { isPrivate: false, category: { isPublic: true } };
  }

  // 普通用户的管理后台 → 仅自己的（home 与管理员规则相同）
  if (scope === "manage" && userRole !== "admin") {
    return { userId };
  }

  // 登录用户 home 视野 + 管理员（任意场景）：自己的全部 + 别人的公开（且分类公开）
  return { OR: [{ userId }, { isPrivate: false, category: { isPublic: true } }] };
}

/**
 * 根据用户身份和视图场景，生成统计口径的 where 条件。
 * 与 buildLinkWhere 一致，但返回类型更宽松（用于 count 等场景）。
 */
export function buildStatsWhere(
  scope: LinkViewScope,
  userId: string | undefined,
  userRole?: string,
): Prisma.LinkWhereInput {
  return buildLinkWhere(scope, userId, userRole) as Prisma.LinkWhereInput;
}

/**
 * 生成缓存键中的 scope 标识
 */
export function cacheScope(scope: LinkViewScope): string {
  return scope === "manage" ? "mgmt" : "pub";
}
