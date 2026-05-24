/**
 * SWR (Stale-While-Revalidate) 内存缓存
 *
 * 策略：
 *   - 缓存命中 + 未过期 → 立刻返回旧数据，后台异步刷新（用户无感）
 *   - 缓存未命中/已过期 → 同步查 DB 并更新缓存
 *
 * 适用：分类树、链接列表等低频变更数据
 * 注意：开发服务器热更新后缓存自动清空；多进程部署需改用 Redis
 */

interface CacheEntry<T = unknown> {
  data: T;
  ts: number; // 写入时间戳
}

const store = new Map<string, CacheEntry>();
let _refreshQueue: Set<string> = new Set(); // 防止重复后台刷新

export function getCached<T = unknown>(key: string): T | undefined {
  const entry = store.get(key);
  return entry?.data as T | undefined;
}

export function setCached<T = unknown>(key: string, data: T): void {
  store.set(key, { data, ts: Date.now() });
}

export function deleteCached(key: string): void {
  store.delete(key);
}

/** 按前缀清除缓存（用于写操作后全量刷新） */
export function invalidateByPrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

export function cacheSize(): number {
  return store.size;
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
  const entry = store.get(key);
  const now = Date.now();

  // 缓存命中且未过期 → 立即返回，后台刷新
  if (entry && now - entry.ts < ttlMs) {
    _scheduleRefresh(key, fetchFn);
    return entry.data as T;
  }

  // 缓存未命中或已过期 → 同步查库
  const data = await fetchFn();
  store.set(key, { data, ts: now });
  return data;
}

// ========== 内部：后台异步刷新 ==========

function _scheduleRefresh<T>(key: string, fetchFn: () => Promise<T>): void {
  // 同一个 key 只允许一个刷新任务排队
  if (_refreshQueue.has(key)) return;
  _refreshQueue.add(key);

  // 微任务执行，不阻塞当前请求
  Promise.resolve()
    .then(() => fetchFn())
    .then((data) => {
      store.set(key, { data, ts: Date.now() });
    })
    .catch((err) => {
      console.warn(`[cache] SWR refresh failed for "${key}":`, (err as Error).message);
    })
    .finally(() => {
      _refreshQueue.delete(key);
    });
}
