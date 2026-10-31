/**
 * 会话管理 —— nuxt-auth-utils 密封 Cookie（HttpOnly）
 *
 * 安全语义：
 *   - 每次请求校验 tokenVersion（改密后强制下线所有设备）与 role（角色变更即时生效）
 *   - 校验结果缓存：Redis 60s 跨实例共享；未启用 Redis 时退化为会话内时间戳
 *     （tokenVersion 5min / role 30s）
 *   - DB 查询异常时保留现有会话，不误杀登录态
 *
 * 密封密钥来自 NUXT_SESSION_PASSWORD；开发环境缺省时用 AUTH_SECRET 派生临时密钥。
 */
import { eq } from "drizzle-orm";
import type { H3Event } from "h3";
import { getDb } from "./db";
import { users } from "~~/server/database/schema";
import { getAuthSecret } from "./auth-secret";
import { sha256Base64 } from "./crypto";
import { getUserAuthCache, setUserAuthCache } from "./user-cache";

export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string | null;
}

export interface Session {
  user: SessionUser;
}

interface SessionData {
  [key: string]: unknown;
  user: SessionUser;
  tv: number;
  tvAt: number;
  roleAt: number;
}

/**
 * nuxt-auth-utils 的密封密钥取自 runtimeConfig.session.password
 * （由 NUXT_SESSION_PASSWORD 环境变量注入，构建产物里该对象只读，不可运行期改写）。
 * 生产环境缺失即报错；开发环境用 AUTH_SECRET 派生临时密钥兜底。
 */
export async function ensureSessionReady(): Promise<void> {
  const config = useRuntimeConfig();
  const password = config.session.password as string | undefined;
  if (password) {
    if (password.length < 32) {
      throw createError({ statusCode: 500, statusMessage: "NUXT_SESSION_PASSWORD 长度需至少 32 位" });
    }
    return;
  }
  if (process.env.NODE_ENV === "production") {
    throw createError({
      statusCode: 500,
      statusMessage: "会话密钥未配置：请设置 NUXT_SESSION_PASSWORD（32 位以上随机串）",
    });
  }
  config.session.password = await sha256Base64(await getAuthSecret());
  console.warn("[auth] 未配置 NUXT_SESSION_PASSWORD，已使用 AUTH_SECRET 派生的临时会话密钥（重启后会话失效）");
}

async function ensureSessionPassword(): Promise<void> {
  await ensureSessionReady();
}

export async function createSession(event: H3Event, userId: string): Promise<void> {
  const [dbUser] = await getDb()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      role: users.role,
      tokenVersion: users.tokenVersion,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!dbUser) throw new Error("用户不存在");

  const now = Math.floor(Date.now() / 1000);
  const data: SessionData = {
    user: {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      image: dbUser.image,
      role: dbUser.role,
    },
    tv: dbUser.tokenVersion,
    tvAt: now,
    roleAt: now,
  };

  await ensureSessionPassword();
  await replaceUserSession(event, data);
}

export async function destroySession(event: H3Event): Promise<void> {
  await ensureSessionPassword();
  await clearUserSession(event);
}

/** 读取并校验会话；无效/已登出返回 null（不抛错） */
export async function getSession(event: H3Event): Promise<Session | null> {
  await ensureSessionPassword();
  const data = (await getUserSession(event)) as Partial<SessionData> & { user?: SessionUser };

  const uid = data.user?.id;
  if (!uid) return null;

  const base: SessionUser = {
    id: uid,
    name: data.user?.name ?? null,
    email: data.user?.email ?? null,
    image: data.user?.image ?? null,
    role: data.user?.role ?? null,
  };
  const tokenVersion = typeof data.tv === "number" ? data.tv : 0;

  // Redis 模式：跨实例共享缓存（TTL 60s），命中即免 DB 查询
  const cachedAuth = await getUserAuthCache(uid);
  if (cachedAuth) {
    if (cachedAuth.tokenVersion !== tokenVersion) {
      console.warn(`[auth] tokenVersion 不匹配：${uid}`);
      return null;
    }
    return { user: { ...base, role: cachedAuth.role } };
  }

  // 降级：会话内时间戳（5min / 30s）
  const now = Math.floor(Date.now() / 1000);
  const tvAt = typeof data.tvAt === "number" ? data.tvAt : 0;
  const roleAt = typeof data.roleAt === "number" ? data.roleAt : 0;
  if (now - tvAt < 300 && now - roleAt < 30) {
    return { user: base };
  }

  try {
    const [dbUser] = await getDb()
      .select({
        name: users.name,
        email: users.email,
        image: users.image,
        tokenVersion: users.tokenVersion,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, uid))
      .limit(1);
    if (!dbUser) {
      console.warn(`[auth] 用户 ${uid} 不存在，销毁会话`);
      return null;
    }
    if (dbUser.tokenVersion !== tokenVersion) {
      console.warn(`[auth] tokenVersion 不匹配：${uid}`);
      return null;
    }
    await setUserAuthCache(uid, { tokenVersion: dbUser.tokenVersion, role: dbUser.role });
    return {
      user: {
        id: uid,
        name: dbUser.name,
        email: dbUser.email,
        image: dbUser.image,
        role: dbUser.role,
      },
    };
  } catch (error) {
    // 数据库异常（冷启动/超时）→ 保留现有会话
    console.error("[auth] tokenVersion 校验查询失败，保留现有会话:", error);
    return { user: base };
  }
}

/** 需要登录的场景：未登录抛 401 */
export async function requireSession(event: H3Event): Promise<Session> {
  const session = await getSession(event);
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, statusMessage: "未登录" });
  }
  return session;
}
