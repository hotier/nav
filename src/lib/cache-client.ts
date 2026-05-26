/**
 * 客户端数据缓存管理器
 *
 * 设计原则（按表分模块、分页存缓存、版本随表走）：
 *   - 一张数据库表 = 独立缓存空间 + 独立版本号 + 分页缓存
 *   - 页面初始化优先读取 localStorage 缓存直接渲染，不阻塞界面
 *   - 后台静默比对版本号，版本不一致才拉取最新数据
 *   - 增删改操作乐观更新 UI + 失败回滚
 *   - 滚动触底加载下一页，逐页缓存互不干扰
 */

// ==================== localStorage 缓存键 ====================

const CACHE_PREFIX = "nav_cache_";
const VERSION_PREFIX = "nav_version_";

/** 按 userId 隔离命名空间，防止切换账号残留缓存；不传 userId 则用公共空间 */
function scopeKey(table: string, userId?: string | null): string {
  const ns = userId ? `u_${userId}` : "pub";
  return `${ns}__${table}`;
}

function cachePageKey(table: string, page: number, userId?: string | null): string {
  return `${CACHE_PREFIX}${scopeKey(table, userId)}_page_${page}`;
}

function versionKey(table: string, userId?: string | null): string {
  return `${VERSION_PREFIX}${scopeKey(table, userId)}`;
}

// ==================== 类型定义 ====================

export interface CachedPage<T> {
  data: T[];
  total: number;
  cachedAt: number;
  version: number;
}

// ==================== 版本管理 ====================

/** 读取本地缓存的版本号 */
export function getLocalVersion(table: string, userId?: string | null): number {
  try {
    return parseInt(localStorage.getItem(versionKey(table, userId)) || "0", 10);
  } catch {
    return 0;
  }
}

/** 写入本地版本号 */
export function setLocalVersion(table: string, version: number, userId?: string | null): void {
  try {
    localStorage.setItem(versionKey(table, userId), String(version));
  } catch {
    // localStorage 不可用（无痕模式等）
  }
}

/** 向服务端查询当前表的最新版本号 */
export async function getServerVersion(table: string): Promise<number> {
  try {
    const res = await fetch(`/api/cache-version?table=${encodeURIComponent(table)}`);
    if (!res.ok) return 0;
    const data = await res.json();
    return data.version || 0;
  } catch {
    return 0;
  }
}

// ==================== 分页缓存读写 ====================

/** 读取指定分页的缓存数据，无缓存返回 null */
export function readPageCache<T>(table: string, page: number, userId?: string | null): CachedPage<T> | null {
  try {
    const raw = localStorage.getItem(cachePageKey(table, page, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPage<T>;
    if (!parsed.data || !Array.isArray(parsed.data)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 写入分页缓存 */
export function writePageCache<T>(
  table: string,
  page: number,
  data: T[],
  total: number,
  version: number,
  userId?: string | null,
): void {
  try {
    const entry: CachedPage<T> = {
      data,
      total,
      cachedAt: Date.now(),
      version,
    };
    localStorage.setItem(cachePageKey(table, page, userId), JSON.stringify(entry));
    setLocalVersion(table, version, userId);
  } catch {
    console.warn(`[cache] 写入缓存失败: ${table} page ${page}`);
  }
}

// ==================== 乐观更新辅助 ====================

/**
 * 乐观添加：操作前先写入缓存（临时用当前缓存的 total+1 作为 total）
 * 成功后由 syncPageCache 重新拉取精确数据
 */
export function optimisticAddToCache<T>(
  table: string,
  page: number,
  item: T,
  userId?: string | null,
): { previousData: T[] | null; previousTotal: number } {
  const cached = readPageCache<T>(table, page, userId);
  const previousData = cached?.data || null;
  const previousTotal = cached?.total || 0;

  // 写入新增后数据（乐观）
  writePageCache(
    table,
    page,
    previousData ? [item, ...previousData] : [item],
    previousTotal + 1,
    getLocalVersion(table, userId) || 1,
    userId,
  );

  return { previousData, previousTotal };
}

/**
 * 回滚缓存：操作失败时恢复到操作前的状态
 */
export function rollbackCache<T>(
  table: string,
  page: number,
  data: T[] | null,
  total: number,
  version?: number,
  userId?: string | null,
): void {
  if (data === null) {
    // 无法恢复，清除分页缓存
    try {
      localStorage.removeItem(cachePageKey(table, page, userId));
    } catch {
      // ignore
    }
    return;
  }
  writePageCache(table, page, data, total, version || getLocalVersion(table, userId), userId);
}
