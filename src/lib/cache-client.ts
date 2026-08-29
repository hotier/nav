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
 * 通知同一源内的所有页面：某张表的数据已变更，需重新拉取。
 *
 * 关键约束：**绝不能在这里同步写方本地版本号**（历史教训，2026-08-29 曾因此引入回归）：
 * - BroadcastChannel 与 storage 事件都天然不回传给发送者页面，写方收不到自己的广播；
 * - 写方的乐观更新只改内存 state，localStorage 的分页缓存仍是旧数据；
 * - 若此时把本地版本对齐成服务端最新，刷新时会"版本一致"而信任旧缓存 → 旧数据。
 * 正确策略：写方本地版本保持旧值，刷新/重挂载时版本不一致 → 重拉覆盖旧缓存；
 * 其他页面/标签页收到广播后版本不一致 → 真正重拉（见 useDataCache / useInfiniteScroll）。
 */
export async function notifyDataChanged(table: string): Promise<void> {
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
//
// 说明：此前的 optimisticAddToCache / rollbackCache（写 localStorage 分页缓存）已删除——
// 它们硬编码 ("Link", page 1) 的键，与真实视图缓存名（Link:category:* / *_ps40 等）不匹配，
// 写入的键没有任何读取方。乐观 UI 更新统一走各 Hook 的 setItems / setData（内存 state），
// 跨页面一致性由 notifyDataChanged（版本同步 + 广播）驱动重拉保证。
