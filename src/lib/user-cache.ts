/**
 * 用户认证信息缓存（tokenVersion + role）
 *
 * 目的：auth.ts 的 jwt callback 每次请求都要校验 tokenVersion / role，
 * 避免每次都查 DB。Redis 模式下将二者缓存在 nav:user:{userId}，TTL 60s，跨实例共享。
 *
 * 一致性设计（与版本化缓存键同哲学）：
 *   - 缓存正确性由「写路径主动失效」保证：改密 / 改角色 / 删用户后必须调用
 *     deleteUserAuthCache 删除缓存键，使旧 token 立即被销毁，无 60s 安全窗口。
 *   - TTL 60s 只是兜底（如 Redis 异常导致写路径删除失败）。
 *   - 「用户不存在」不写入缓存：DB 查不到用户时缓存应保持 miss，
 *     这样删除用户后（即使删除键失败）旧缓存最多只在 TTL 内残留。
 *
 * 降级：未配置 Redis（getRedis() 返回 null）或缓存异常时，
 * 本模块一律返回 null / 空操作，调用方（auth.ts）自动降级为
 * 原有 JWT 会话内时间戳缓存，行为与未接入 Redis 前完全一致。
 */

import { USER_CACHE_PREFIX, getRedis } from "@/lib/redis";

export interface UserAuthInfo {
  tokenVersion: number;
  role: string;
}

const TTL_SECONDS = 60;

/** 读取缓存；未配置 Redis / miss / 内容损坏均返回 null */
export async function getUserAuthCache(userId: string): Promise<UserAuthInfo | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const v = await client.get<{ tokenVersion?: number; role?: string }>(
      USER_CACHE_PREFIX + userId
    );
    if (v && typeof v.tokenVersion === "number" && typeof v.role === "string") {
      return { tokenVersion: v.tokenVersion, role: v.role };
    }
    return null;
  } catch {
    // 缓存异常 → 降级走 DB
    return null;
  }
}

/** 写入缓存（仅在 Redis 模式下生效；失败静默） */
export async function setUserAuthCache(userId: string, info: UserAuthInfo): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.set(USER_CACHE_PREFIX + userId, JSON.stringify(info), {
      ex: TTL_SECONDS,
    });
  } catch {
    // 写缓存失败不影响主流程
  }
}

/** 删除缓存（写路径调用：改密 / 改角色 / 删用户后立即失效） */
export async function deleteUserAuthCache(userId: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.del(USER_CACHE_PREFIX + userId);
  } catch {
    // 删除失败 → 依赖 TTL 兜底
  }
}
