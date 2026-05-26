/**
 * useDataCache — 统一数据获取 Hook
 *
 * 所有页面唯一的缓存读取入口：缓存优先渲染 → 后台版本比对 → 按需拉取
 *
 * 用法：
 *   const { data, loading, syncing, setData } = useDataCache([
 *     { name: "Link",    fetch: () => fetch("/api/links?includePrivate=true&pageSize=20").then(r => r.json()) },
 *     { name: "Category",fetch: () => fetch("/api/categories").then(r => r.json()) },
 *   ]);
 *   const links      = data["Link"]     || [];
 *   const categories = data["Category"] || [];
 */
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  readPageCache,
  writePageCache,
  getLocalVersion,
  getServerVersion,
} from "@/lib/cache-client";

// ==================== 类型定义 ====================

interface FetchResult {
  data: unknown[];
  total: number;
}

interface TableConfig {
  /** 缓存表名（对应 localStorage key） */
  name: string;
  /** 拉取该表最新数据的函数，返回 { data, total } */
  fetch: () => Promise<FetchResult>;
}

interface UseDataCacheOptions {
  configs: TableConfig[];
  /** 用户 ID，用于 localStorage 命名空间隔离，防切换账号残留缓存 */
  userId?: string | null;
}

interface UseDataCacheReturn {
  /** 各表数据，按 name 索引 */
  data: Record<string, unknown[]>;
  /** 首次加载中（无缓存时）*/
  loading: boolean;
  /** 后台同步中 */
  syncing: boolean;
  /** 手动更新某表数据（用于乐观增删改）*/
  setData: (tableName: string, updater: (prev: unknown[]) => unknown[]) => void;
}

// ==================== Hook 实现 ====================

export function useDataCache(options: UseDataCacheOptions): UseDataCacheReturn {
  const { configs, userId } = options;

  // 同步读取 localStorage 缓存作为初始状态 → 消除首次渲染的空状态（loading spinner→content 闪烁）
  const [allData, setAllData] = useState<Record<string, unknown[]>>(() => {
    const uid = userId || null;
    const cached: Record<string, unknown[]> = {};
    for (const { name } of configs) {
      const c = readPageCache(name, 1, uid);
      if (c && c.data.length > 0) {
        cached[name] = c.data;
      }
    }
    return cached;
  });
  const [loading, setLoading] = useState(() => {
    const uid = userId || null;
    for (const { name } of configs) {
      const c = readPageCache(name, 1, uid);
      if (c && c.data.length > 0) return false;
    }
    return true;
  });
  const [syncing, setSyncing] = useState(false);

  // 存 configs 引用，避免 stale closure
  const configsRef = useRef(configs);
  configsRef.current = configs;

  // 存 userId 引用，供 effect 内部使用
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // 标记是否有手动 setData 调用，防止后台同步覆盖用户操作
  const manualTablesRef = useRef(new Set<string>());

  const uid = userId || null;

  // ===== 初始化：缓存优先 + 后台同步 =====

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const cfgs = configsRef.current;
      const currentUserId = userIdRef.current || null;

      // 优先用 lazy init 时已有的数据，若无缓存再同步读取
      const cached: Record<string, unknown[]> = {};
      for (const { name } of cfgs) {
        const c = readPageCache(name, 1, currentUserId);
        if (c && c.data.length > 0) {
          cached[name] = c.data;
        }
      }
      // 仅当 lazy init 无缓存而 effect 阶段读到缓存时，才更新状态
      if (Object.keys(cached).length > 0 && !cancelled) {
        setAllData((prev) => {
          // 如果 lazy init 已读取了同一份数据（引用相同），跳过更新
          const hasNew = Object.keys(cached).some((key) => !(key in prev) || prev[key] !== cached[key]);
          return hasNew ? cached : prev;
        });
        setLoading(false);
      }

      // 2. 后台并行比对版本号，按需拉取
      setSyncing(true);
      try {
        const results = await Promise.all(
          cfgs.map(async ({ name, fetch: fetchFn }) => {
            if (cancelled) return { name, data: cached[name] || [] };

            const serverVer = await getServerVersion(name);
            const localVer = getLocalVersion(name, currentUserId);

            // 版本一致 → 用缓存
            if (localVer && localVer === serverVer) {
              const c = readPageCache(name, 1, currentUserId);
              return { name, data: c?.data || cached[name] || [] };
            }

            // 版本不一致 / 无本地版本 → 重新拉取
            try {
              const result = await fetchFn();
              if (cancelled) return { name, data: cached[name] || [] };

              // ✅ 验证返回数据：防止 malformed response（如 401 返回 { error: "..." }）
              if (!Array.isArray(result?.data)) {
                console.warn(`[useDataCache] ${name} fetch 返回格式异常，回退缓存`);
                const c = readPageCache(name, 1, currentUserId);
                return { name, data: c?.data || cached[name] || [] };
              }

              writePageCache(name, 1, result.data, result.total, serverVer || 1, currentUserId);
              return { name, data: result.data };
            } catch {
              // 拉取失败，回退到缓存
              const c = readPageCache(name, 1, currentUserId);
              return { name, data: c?.data || cached[name] || [] };
            }
          })
        );

        if (!cancelled) {
          const final: Record<string, unknown[]> = {};
          for (const r of results) {
            final[r.name] = r.data;
          }
          // ✅ 手动 setData 过的表不覆盖，防止后台同步回退用户操作
          setAllData((prev) => {
            const merged = { ...final };
            for (const table of manualTablesRef.current) {
              if (table in prev) merged[table] = prev[table];
            }
            return merged;
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setSyncing(false);
        }
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [uid]); // userId 变化时重新初始化缓存

  // ===== 手动更新数据（乐观 CRUD）=====

  const setData = useCallback(
    (tableName: string, updater: (prev: unknown[]) => unknown[]) => {
      manualTablesRef.current.add(tableName);
      setAllData((prev) => ({
        ...prev,
        [tableName]: updater(prev[tableName] || []),
      }));
    },
    []
  );

  return { data: allData, loading, syncing, setData };
}
