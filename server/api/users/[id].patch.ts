import { count, eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb, getDbPool } from "~~/server/utils/db";
import { requireSession } from "~~/server/utils/session";
import { adminOnly } from "~~/server/utils/permissions";
import { incrementTableVersion } from "~~/server/utils/queries";
import { deleteUserAuthCache } from "~~/server/utils/user-cache";
import { defineApiHandler, fail } from "~~/server/utils/api";
import { links, users } from "~~/server/database/schema";

/** 修改用户角色 / 管理员重置密码（仅管理员） */
export default defineApiHandler(async (event) => {
  const session = await requireSession(event);
  adminOnly(session);

  const id = getRouterParam(event, "id");
  if (!id) return fail(event, 404, "用户不存在");

  const db = getDb();
  const [user] = await db
    .select({ id: users.id, role: users.role, isSystemAdmin: users.isSystemAdmin })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user) return fail(event, 404, "用户不存在");

  // 请求体缺失或不是合法 JSON：与旧实现一致，按操作失败处理
  const body = await readBody<Record<string, unknown> | undefined>(event).catch(() => undefined);
  if (!body) return fail(event, 500, "操作失败");

  const { role, password } = body;

  // 角色只允许 admin / user（未传则不修改）
  let nextRole: "admin" | "user" | undefined;
  if (role !== undefined) {
    if (role !== "admin" && role !== "user") return fail(event, 400, "无效的角色值");
    nextRole = role;
  }

  // 系统级管理员（项目初始化账号）不可降级
  if (user.isSystemAdmin && nextRole === "user") {
    return fail(event, 400, "系统级管理员不可修改为普通用户");
  }

  // 管理员降级为普通用户 → 确保至少还有一位管理员
  if (user.role === "admin" && nextRole === "user") {
    const [admins] = await db.select({ value: count() }).from(users).where(eq(users.role, "admin"));
    if (Number(admins?.value ?? 0) <= 1) {
      return fail(event, 400, "必须至少保留一位管理员，请先将其他用户设为管理员");
    }
  }

  if (password !== undefined) {
    if (typeof password !== "string" || password.length < 6) {
      return fail(event, 400, "新密码长度不能少于6位");
    }
  }
  const newPassword = typeof password === "string" ? password : undefined;

  // 无任何可更新字段
  if (nextRole === undefined && newPassword === undefined) {
    return fail(event, 400, "没有可更新的内容");
  }

  try {
    const hashedPassword = newPassword !== undefined ? await bcrypt.hash(newPassword, 10) : undefined;

    // 数据写入 + 版本号递增同事务
    const updated = await getDbPool().transaction(async (tx) => {
      const [result] = await tx
        .update(users)
        .set({
          ...(nextRole !== undefined ? { role: nextRole } : {}),
          // 重置密码（或改角色）都递增 tokenVersion → 旧 session/token 立即失效
          ...(hashedPassword !== undefined ? { password: hashedPassword } : {}),
          tokenVersion: sql`${users.tokenVersion} + 1`,
        })
        .where(eq(users.id, id))
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          username: users.username,
          image: users.image,
          role: users.role,
          isSystemAdmin: users.isSystemAdmin,
          createdAt: users.createdAt,
        });
      await incrementTableVersion("User", tx);
      return result;
    });

    const [linkCount] = await db
      .select({ value: count() })
      .from(links)
      .where(eq(links.userId, id));

    // 递增 tokenVersion → 清除认证缓存，旧 token 立即失效
    await deleteUserAuthCache(id);
    return { ...updated, _count: { links: Number(linkCount?.value ?? 0) } };
  } catch {
    return fail(event, 500, "操作失败");
  }
});
