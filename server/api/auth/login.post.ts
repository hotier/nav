import { eq, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb } from "~~/server/utils/db";
import { createSession } from "~~/server/utils/session";
import { getClientIp, isRateLimited } from "~~/server/utils/rate-limit";
import { defineApiHandler, fail } from "~~/server/utils/api";
import { users } from "~~/server/database/schema";

export default defineApiHandler(async (event) => {
  const ip = getClientIp(event);
  if (await isRateLimited(`login:ip:${ip}`, 30, 60 * 1000)) {
    return fail(event, 429, "登录尝试过于频繁，请稍后再试");
  }

  const { username, password } = await readBody<{ username?: string; password?: string }>(event);
  if (!username || !password) return fail(event, 400, "请输入用户名和密码");

  const [user] = await getDb()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      role: users.role,
      password: users.password,
    })
    .from(users)
    .where(or(eq(users.username, username), eq(users.email, username)))
    .limit(1);
  if (!user?.password) return fail(event, 401, "用户名或密码错误");

  if (await isRateLimited(`login:account:${user.id}`, 10, 60 * 1000)) {
    return fail(event, 429, "登录尝试过于频繁，请稍后再试");
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return fail(event, 401, "用户名或密码错误");

  await createSession(event, user.id);

  return {
    success: true,
    user: { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role },
  };
});
