import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb, getDbPool } from "~~/server/utils/db";
import { requireSession } from "~~/server/utils/session";
import { adminOnly } from "~~/server/utils/permissions";
import { incrementTableVersion } from "~~/server/utils/queries";
import { defineApiHandler, fail } from "~~/server/utils/api";
import { users } from "~~/server/database/schema";

// GitHub username validation pattern
const GITHUB_USERNAME_REGEX = /^[a-zA-Z0-9](?!.*--)(?!.*-$)[a-zA-Z0-9-]{0,37}[a-zA-Z0-9]$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidUsername(username: string): boolean {
  if (!username || username.length < 1 || username.length > 39) return false;
  return GITHUB_USERNAME_REGEX.test(username);
}

/**
 * 管理员手动创建账号（仅管理员）
 *
 * 降级策略：当未配置 Resend（邮件服务）时，自助注册因无法邮箱验证而整体关闭，
 * 由管理员在后台代为创建账号。创建后视为已验证（emailVerified = now），可直接登录。
 */
export default defineApiHandler(async (event) => {
  const session = await requireSession(event);
  adminOnly(session);

  const body = await readBody<Record<string, unknown>>(event).catch(
    () => ({}) as Record<string, unknown>,
  );
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const role = typeof body?.role === "string" ? body.role : "user";

  if (!username || !email || !password) {
    return fail(event, 400, "用户名、邮箱和密码不能为空");
  }

  if (!isValidUsername(username)) {
    return fail(
      event,
      400,
      "用户名必须为1-39个字符，只能包含字母、数字和单连字符，不能以连字符开头或结尾，不能有连续连字符",
    );
  }

  if (!EMAIL_REGEX.test(email)) {
    return fail(event, 400, "请输入有效的邮箱地址");
  }

  if (password.length < 6) {
    return fail(event, 400, "密码长度不能少于6位");
  }

  if (!["admin", "user"].includes(role)) {
    return fail(event, 400, "无效的角色值");
  }

  const db = getDb();
  // 用户名唯一（与自助注册一致，统一小写存储）
  const [existingUsername] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username.toLowerCase()))
    .limit(1);
  if (existingUsername) {
    return fail(event, 400, "用户名已存在");
  }

  // 邮箱唯一
  const [existingEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existingEmail) {
    return fail(event, 400, "邮箱已被注册");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  // 不再自动创建默认分类：新用户可直接使用他人的公开分类，
  // 也避免每个新用户都产生同名公开分类导致名称重复
  // 数据写入 + 版本号递增同事务
  const user = await getDbPool().transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        username: username.toLowerCase(),
        name: name || username,
        email,
        password: hashedPassword,
        role,
        // 管理员手动创建：视为已验证，账号立即可用
        emailVerified: new Date(),
      })
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
    return created;
  });

  setResponseStatus(event, 201);
  return { ...user, _count: { links: 0 } };
});
