/**
 * 服务端数据缓存 —— Redis 优先，内存 LRU 降级
 *
 * 只服务「版本化缓存键」（见 cache-keys.ts）：键里编入了表版本号，
 * 同一 key 对应的数据永不变化，所以命中即可直接返回，不需要后台刷新。
 * 旧实现每次命中都会再触发一次全量查询（serverless 里响应返回后还未必执行），
 * 纯属 DB 放大，已删除。
 *
 * 后端选择（见 lib/redis.ts）：
 *   - 配置 Upstash Redis → 跨实例共享（Vercel serverless 多实例推荐）
 *   - 未配置 → 单实例内存 Map（开发环境 / 单机部署），容量有上限，按 LRU 淘汰
 */

import { CACHE_KEY_PREFIX, getRedis } from "@/lib/redis";

interface CacheEntry<T = unknown> {
  data: T;
  ts: number;
}

/** 内存后端容量上限：超过后淘汰最久未使用的键，防止长驻实例内存无界增长 */
const MEMORY_CACHE_MAX = 200;

const store = new Map<string, CacheEntry>();

function memGet(key: string): CacheEntry | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  // Map 按插入顺序迭代：删除后重新插入 = 移到队尾（最近使用）
  store.delete(key);
  store.set(key, entry);
  return entry;
}

function memSet(key: string, data: unknown): void {
  store.delete(key);
  store.set(key, { data, ts: Date.now() });
  while (store.size > MEMORY_CACHE_MAX) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

/**
 * SWR 读取：命中返回缓存，未命中/过期则查询并写回。
 * @param key     缓存键（版本化键，同一 key 的数据不会变化）
 * @param fetchFn 实际查询函数
 * @param ttlMs   缓存有效期（毫秒），仅用于内存/Redis 淘汰，默认 60s
 */
export async function swr<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlMs = 60_000
): Promise<T> {
  const client = getRedis();

  if (client) {
    const rkey = CACHE_KEY_PREFIX + key;
    try {
      const cached = await client.get<string>(rkey);
      if (typeof cached === "string") {
        return JSON.parse(cached) as T;
      }
    } catch {
      // 读缓存异常 → 当作 miss
    }
    const data = await fetchFn();
    try {
      await client.set(rkey, JSON.stringify(data), {
        ex: Math.max(1, Math.floor(ttlMs / 1000)),
      });
    } catch {
      // 写缓存失败不影响本次响应
    }
    return data;
  }

  const entry = memGet(key);
  if (entry && Date.now() - entry.ts < ttlMs) {
    return entry.data as T;
  }

  const data = await fetchFn();
  memSet(key, data);
  return data;
}
