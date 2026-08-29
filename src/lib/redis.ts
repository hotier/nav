/**
 * Upstash Redis 客户端（惰性单例）
 *
 * 双模式开关：
 *   - 配置了 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN → 启用 Redis，
 *     cache.ts（数据缓存）与 rate-limit.ts（限流计数）自动走 Redis 后端，多实例共享。
 *   - 未配置 → getRedis() 返回 null，调用方自动降级为单实例内存实现。
 *
 * 适用：Vercel serverless / 多实例部署必须启用；单实例可不开（内存足够）。
 * 版本号缓存键仍由 DB（AppSetting）承载，Redis 只放数据/计数，两者互不干扰。
 */

import { Redis } from "@upstash/redis";

/** 缓存键前缀，与限流键（nav:rl:*）隔离 */
export const CACHE_KEY_PREFIX = "nav:cache:";
/** 限流计数键前缀 */
export const RATE_LIMIT_KEY_PREFIX = "nav:rl:";
/** URL 识别结果缓存前缀（按域名，跨用户共享） */
export const RECOG_CACHE_PREFIX = "nav:recog:";
/** favicon 图片字节缓存前缀（按域名，二进制 base64） */
export const ICON_CACHE_PREFIX = "nav:icon:";
/** 用户认证信息缓存前缀（tokenVersion + role，按 userId） */
export const USER_CACHE_PREFIX = "nav:user:";

let _client: Redis | null | undefined;

/** 获取 Redis 客户端；未配置返回 null（调用方降级） */
export function getRedis(): Redis | null {
  if (_client !== undefined) return _client;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    _client = null;
    return null;
  }

  _client = new Redis({ url, token });
  return _client;
}

export function isRedisEnabled(): boolean {
  return getRedis() !== null;
}
