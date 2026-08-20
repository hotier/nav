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

// ==================== 跨页面变更广播 ====================
//
// 解决“已打开页面/多标签页数据不实时同步”的问题。
// 任意页面完成一次数据写操作（增删改）后调用 notifyDataChanged(table)，
// 同源的其他页面通过 BroadcastChannel（同标签页内跨路由）与 storage 事件
// （跨标签页）监听该表变更，触发重新拉取，保证所有页面数据一致。

let _channel: BroadcastChannel | null = null;
let _channelName = "";
const _subscribers = new Set<(table: string) => void>();

/** 确保 BroadcastChannel 已初始化（仅浏览器环境，不跨 tab 时自动降级） */
function ensureChannel(name: string): void {
  if (_channel && _channelName === name) return;
  closeChannel();
  try {
    _channel = new BroadcastChannel(name);
    _channelName = name;
    _channel.onmessage = (e: MessageEvent) => {
      const table = (e.data as { table?: string } | undefined)?.table;
      if (!table) return;
      // 通知所有订阅者该表已变更
      _subscribers.forEach((fn) => {
        try {
          fn(table);
        } catch {
          // ignore
        }
      });
    };
  } catch {
    _channel = null;
  }
}

function closeChannel(): void {
  if (_channel) {
    try {
      _channel.close();
    } catch {
      // ignore
    }
  }
  _channel = null;
  _channelName = "";
}

/**
 * 写操作成功后调用：把本地版本号同步为服务端最新版本。
 * 这样当前页的广播回调检测到“版本一致”会跳过自动刷新，
 * 而其他页面（本地版本旧）仍会重新拉取，避免当前页因自身操作被 reset 回第一页。
 */
export async function syncLocalVersion(table: string, userId?: string | null): Promise<void> {
  const serverVer = await getServerVersion(table);
  if (serverVer) {
    setLocalVersion(table, serverVer, userId);
  }
}

/** 通知同一源内的所有页面：某张表的数据已变更，需重新拉取 */
export function notifyDataChanged(table: string): void {
  try {
    ensureChannel("nav-cache-sync");
    if (_channel) {
      _channel.postMessage({ type: "table-changed", table });
    }
  } catch {
    // BroadcastChannel 不可用
  }
  // 兜底：storage 事件（BroadcastChannel 不支持时跨标签页用 localStorage 触发）
  try {
    localStorage.setItem("nav_cache_change", `${table}_${Date.now()}`);
  } catch {
    // ignore
  }
}

/**
 * 订阅“某表数据变更”通知。
 * onChange(table) 会在对应表变更时被调用，由订阅方自行判断是否关心该表并重新拉取。
 * 返回取消订阅函数。
 */
export function subscribeDataChanged(onChange: (table: string) => void): () => void {
  _subscribers.add(onChange);

  const handleStorage = (e: StorageEvent) => {
    if (e.key === "nav_cache_change" && e.newValue) {
      const table = e.newValue.split("_")[0] || "";
      onChange(table);
    }
  };
  window.addEventListener("storage", handleStorage);

  ensureChannel("nav-cache-sync");

  return () => {
    _subscribers.delete(onChange);
    window.removeEventListener("storage", handleStorage);
  };
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
