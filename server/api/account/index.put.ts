import { and, eq, ne } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb, getDbPool } from "~~/server/utils/db";
import { requireSession } from "~~/server/utils/session";
import { incrementTableVersion } from "~~/server/utils/queries";
import { deleteUserAuthCache } from "~~/server/utils/user-cache";
import { defineApiHandler, fail } from "~~/server/utils/api";
import { users } from "~~/server/database/schema";

export default defineApiHandler(async (event) => {
  const session = await requireSession(event);
  const { name, email, image, currentPassword, newPassword } = await readBody<{
    name?: string;
    email?: string;
    image?: string | null;
    currentPassword?: string;
    newPassword?: string;
  }>(event);

  const [user] = await getDb()
    .select({ id: users.id, password: users.password, tokenVersion: users.tokenVersion })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user) return fail(event, 404, "用户不存在");

  const updateData: Partial<typeof users.$inferInsert> = {};

  if (name !== undefined) updateData.name = name;

  if (email !== undefined) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(event, 400, "邮箱格式不正确");
    const [existing] = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), ne(users.id, session.user.id)))
      .limit(1);
    if (existing) return fail(event, 400, "该邮箱已被其他账号使用");
    updateData.email = email;
  }

  if (image !== undefined) updateData.image = image;

  if (newPassword) {
    if (!currentPassword) return fail(event, 400, "请输入当前密码");
    if (!user.password) return fail(event, 400, "OAuth 登录的用户无密码，请使用对应平台修改密码");
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return fail(event, 400, "当前密码不正确");
    if (newPassword.length < 6) return fail(event, 400, "新密码至少6位");
    updateData.password = await bcrypt.hash(newPassword, 12);
    // 递增 tokenVersion，所有已登录设备下次请求时强制下线
    updateData.tokenVersion = user.tokenVersion + 1;
  }

  if (Object.keys(updateData).length === 0) return fail(event, 400, "没有要更新的内容");

  const updated = await getDbPool().transaction(async (tx) => {
    const [result] = await tx
      .update(users)
      .set(updateData)
      .where(eq(users.id, session.user.id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        username: users.username,
        image: users.image,
        createdAt: users.createdAt,
      });
    await incrementTableVersion("User", tx);
    return result;
  });

  if (updateData.tokenVersion !== undefined) {
    await deleteUserAuthCache(session.user.id);
  } else {
    // 资料变更同步进密封会话，避免布局/导航继续展示旧昵称头像。
    // 改密码走 tokenVersion 失效流程，不刷新会话（客户端会重新登录）。
    try {
      const current = await getUserSession(event);
      if (current?.user) {
        await replaceUserSession(event, {
          ...current,
          user: {
            ...current.user,
            name: updated.name,
            email: updated.email,
            image: updated.image,
          },
        });
      }
    } catch (error) {
      console.warn("[account] 更新会话失败:", error);
    }
  }

  return updated;
});
