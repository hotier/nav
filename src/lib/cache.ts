/**
 * SWR (Stale-While-Revalidate) 缓存 —— Redis 优先，内存降级
 *
 * 策略：
 *   - 缓存命中 + 未过期 → 立刻返回旧数据，后台异步刷新（用户无感）
 *   - 缓存未命中/已过期 → 同步查 DB 并更新缓存
 *
 * 后端选择（见 lib/redis.ts）：
 *   - 配置 Upstash Redis → 跨实例共享（Vercel serverless 多实例推荐）
 *   - 未配置 → 单实例内存 Map（开发环境 / 单机部署）
 *
 * 适用：分类树、链接列表、仪表盘统计等低频变更数据。
 * 正确性说明：失效由版本化键保证（版本号编进键，写操作递增版本翻页），
 * TTL 只是兜底；因此 Redis 模式无需关心跨实例主动失效。
 */

import { CACHE_KEY_PREFIX, getRedis } from "@/lib/redis";

interface CacheEntry<T = unknown> {
  data: T;
  ts: number; // 写入时间戳
}

// ========== 内存后端（无 Redis 时降级） ==========

const store = new Map<string, CacheEntry>();
let _refreshQueue: Set<string> = new Set(); // 防止重复后台刷新

const redis = () => getRedis();

function memGet<T>(key: string): T | undefined {
  return store.get(key)?.data as T | undefined;
}

function memSet(key: string, data: unknown): void {
  store.set(key, { data, ts: Date.now() });
}

// ========== 对外 API（保持签名兼容，见文件头调用方说明） ==========

/**
 * 同步读取缓存值。
 * 注意：Redis 模式下本函数仅读内存（不存在跨实例读取），仅供内存辅助场景使用；
 * 数据读取请走 swr。
 */
export function getCached<T = unknown>(key: string): T | undefined {
  return memGet<T>(key);
}

/** 同步写入缓存（仅内存后端；Redis 模式下请走 swr 由它统一 SET） */
export function setCached<T = unknown>(key: string, data: T): void {
  memSet(key, data);
}

/** 删除缓存。Redis 模式下为异步下发（fire-and-forget），调用方无需 await */
export function deleteCached(key: string): void {
  if (redis()) {
    void redis()!.del(CACHE_KEY_PREFIX + key);
  }
  store.delete(key);
}

/** 按前缀清除缓存（用于写操作后全量刷新） */
export async function invalidateByPrefix(prefix: string): Promise<void> {
  const client = redis();
  if (client) {
    const pattern = CACHE_KEY_PREFIX + prefix + "*";
    let cursor = 0;
    do {
      const [next, keys] = await client.scan(cursor, { match: pattern, count: 100 });
      cursor = Number(next);
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } while (cursor !== 0);
    return;
  }

  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

/**
 * SWR 读取：立即返回缓存，后台异步刷新
 * @param key    缓存键（唯一标识数据源）
 * @param fetchFn 实际查询函数
 * @param ttlMs  缓存有效期（毫秒），默认 60s
 */
export async function swr<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlMs = 60_000
): Promise<T> {
  const client = redis();
  const rkey = CACHE_KEY_PREFIX + key;

  if (client) {
    const cached = await client.get<string>(rkey);
    if (cached != null) {
      _scheduleRefresh(rkey, key, fetchFn, ttlMs, client);
      try {
        return JSON.parse(cached) as T;
      } catch {
        // 缓存内容损坏 → 当作 miss，重新查库覆盖
        const data = await fetchFn();
        await client.set(rkey, JSON.stringify(data), {
          ex: Math.max(1, Math.floor(ttlMs / 1000)),
        });
        return data;
      }
    }
    const data = await fetchFn();
    await client.set(rkey, JSON.stringify(data), {
      ex: Math.max(1, Math.floor(ttlMs / 1000)),
    });
    return data;
  }

  // ---- 内存后端（单实例） ----
  const entry = store.get(key);
  const now = Date.now();

  if (entry && now - entry.ts < ttlMs) {
    _scheduleRefresh(rkey, key, fetchFn, ttlMs, null);
    return entry.data as T;
  }

  const data = await fetchFn();
  store.set(key, { data, ts: now });
  return data;
}

// ========== 内部：后台异步刷新（Redis 与内存共用防重队列） ==========

async function _refreshInto<T>(
  client: ReturnType<typeof redis>,
  memKey: string,
  rkey: string,
  fetchFn: () => Promise<T>,
  ttlMs: number,
): Promise<void> {
  const data = await fetchFn();
  if (client) {
    await client.set(rkey, JSON.stringify(data), {
      ex: Math.max(1, Math.floor(ttlMs / 1000)),
    });
  } else {
    store.set(memKey, { data, ts: Date.now() });
  }
}

function _scheduleRefresh<T>(
  rkey: string,
  memKey: string,
  fetchFn: () => Promise<T>,
  ttlMs: number,
  client: ReturnType<typeof redis>,
): void {
  // 同一个 key 只允许一个刷新任务排队（内存键与 Redis 键同源，统一用 memKey 去重）
  if (_refreshQueue.has(memKey)) return;
  _refreshQueue.add(memKey);

  Promise.resolve()
    .then(() => _refreshInto(client, memKey, rkey, fetchFn, ttlMs))
    .catch((err) => {
      console.warn(`[cache] SWR refresh failed for "${memKey}":`, (err as Error).message);
    })
    .finally(() => {
      _refreshQueue.delete(memKey);
    });
}
