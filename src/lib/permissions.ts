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
 * - 管理员 manage/home：公开分类 + 自己创建的私有分类（含被隐藏的，便于管理/解除隐藏）
 *   —— 普通用户主动设为私有的分类对管理员不可见
 * - 普通用户：公开分类（未隐藏）+ 自己创建的分类（未隐藏）
 * - 未登录：只看公开且未隐藏的分类
 */
export function buildCategoryWhere(
  userId: string | undefined,
  scope: LinkViewScope = "home",
  userRole?: string,
): Prisma.CategoryWhereInput {
  if (userRole === "admin" && scope === "manage") {
    return { OR: [{ isPublic: true }, { userId }] } as unknown as Prisma.CategoryWhereInput; // 公开（含隐藏）+ 自己的私有
  }
  if (!userId) {
    return { isPublic: true, isHidden: false } as unknown as Prisma.CategoryWhereInput;
  }
  if (userRole === "admin") {
    // 管理员 home：不过滤隐藏（链接管理页数据源为 home 视野，管理员需能看到隐藏内容）
    return { OR: [{ isPublic: true }, { userId }] } as unknown as Prisma.CategoryWhereInput;
  }
  // 普通用户：排除被管理员隐藏的内容
  return {
    isHidden: false,
    OR: [{ isPublic: true }, { userId }],
  } as unknown as Prisma.CategoryWhereInput;
}

/**
 * 检查当前用户是否能编辑/删除某个分类。
 *
 * 规则：
 * - 管理员：可管理任意公开分类 + 自己创建的私有分类（不能管理他人私有分类）
 * - 普通用户：只能操作自己创建的分类（公开/私有均可——普通用户有权创建公开分类）
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
  // 普通用户：只能操作自己创建的分类（公开/私有均可）
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
 * - 被隐藏的分类：仅管理员可添加（普通用户不可见）
 */
export function canAddLinkToCategory(
  session: Session | null,
  category: { userId: string | null; isPublic: boolean; isHidden?: boolean },
): NextResponse | null {
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role;
  if (role === "admin") return null;
  if (category.isHidden) {
    return NextResponse.json({ error: "该分类已被管理员隐藏，无权添加链接" }, { status: 403 });
  }
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
 * | home   | 未登录         | 公开链接（且所属分类公开、均未隐藏） |
 * | home   | 管理员         | 自己的全部 + 别人的公开（含隐藏内容）|
 * | home   | 普通用户       | 自己的全部 + 别人的公开 + 自己分类下的他人公开（均排除隐藏）|
 * | manage | 管理员         | 自己的全部 + 别人的公开（含隐藏内容）|
 * | manage | 普通用户       | 仅自己的全部（排除被隐藏的）       |
 *
 * 注：管理员在 home/manage 均可见被隐藏内容（管理/解除隐藏用）；
 *     普通用户与未登录用户看不到任何被隐藏的链接或分类。
 */
export function buildLinkWhere(
  scope: LinkViewScope,
  userId: string | undefined,
  userRole?: string,
): Prisma.LinkWhereInput {
  if (!userId) {
    // 未登录 → 只看公开链接，且所属分类也是公开的（均未隐藏）
    return { isPrivate: false, isHidden: false, category: { isPublic: true, isHidden: false } };
  }

  // 普通用户的管理后台 → 仅自己的（排除被隐藏的）
  if (scope === "manage" && userRole !== "admin") {
    return { userId, isHidden: false };
  }

  // 管理员（任意场景）：自己的全部 + 别人的公开（含隐藏内容，便于管理/解除隐藏）
  if (userRole === "admin") {
    return { OR: [{ userId }, { isPrivate: false, category: { isPublic: true } }] };
  }

  // 登录普通用户 home：自己的全部 + 别人的公开（均排除隐藏）
  return {
    OR: [
      { userId, isHidden: false }, // 自己的全部（现状）
      // 他人的公开链接，且其所属分类是公开的（现状）
      { isPrivate: false, isHidden: false, category: { isPublic: true, isHidden: false } },
      // 新增：我创建的分类下的他人公开链接（分类私有化后对创建者仍可见，数量不跳变）
      { isPrivate: false, isHidden: false, category: { userId, isHidden: false } },
    ],
  };
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
