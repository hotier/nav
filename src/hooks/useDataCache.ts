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
  setLocalVersion,
  subscribeDataChanged,
} from "@/lib/cache-client";

// ==================== 类型定义 ====================

interface FetchResult {
  data: unknown[];
  total: number;
}

interface TableConfig {
  /** 缓存表名（对应 localStorage key，用于页面/分类/角色隔离） */
  name: string;
  /** 版本号用的全量表级 key（默认取 name）。
   *  全量版本号：任何数据变更都会递增它，所有页面（不管 name 如何）比对它判断数据是否过期 */
  versionTable?: string;
  /** 额外订阅的数据变更表（表级 key）：收到这些表的广播时，也校验本表版本号并按需重拉。
   *  用于联动表——如 DashboardStats 需在 Link/Category/User 变更时刷新统计 */
  subscribe?: string[];
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

  // 同步逻辑抽为可复用函数：init 与“收到跨页面广播”共用
  const syncDataRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let cancelled = false;

    const readCached = (): Record<string, unknown[]> => {
      const cfgs = configsRef.current;
      const currentUserId = userIdRef.current || null;
      const cached: Record<string, unknown[]> = {};
      for (const { name } of cfgs) {
        const c = readPageCache(name, 1, currentUserId);
        if (c && c.data.length > 0) {
          cached[name] = c.data;
        }
      }
      return cached;
    };

    /** 后台比对版本号，按需拉取（init 与广播重拉共用） */
    const syncData = async () => {
      const cfgs = configsRef.current;
      const currentUserId = userIdRef.current || null;

      setSyncing(true);
      try {
        const results = await Promise.all(
          cfgs.map(async ({ name, versionTable, fetch: fetchFn }) => {
            if (cancelled) return { name, data: [] as unknown[] };

            // 用全量表级版本号判断数据是否过期（name 只用于缓存/页面隔离）
            const versionKey = versionTable || name;
            // 本地版本号按「视图」隔离（表级版本号 + 视图名），与 useInfiniteScroll 保持一致：
            // 若共享同一个本地版本号，首页（name="Category"）重拉后 setLocalVersion 会把版本同步到最新，
            // 分类管理页（name="Category:mgmt:v2"）会误以为自己的缓存也是最新的而跳过重拉 → 读到旧缓存/空数据。
            const localVersionKey = `${versionKey}__view__${name}`;
            const serverVer = await getServerVersion(versionKey);
            const localVer = getLocalVersion(localVersionKey, currentUserId);

            // 版本一致 → 用缓存。但缓存为空时不能直接信任（可能是历史瞬时错误写入的空缓存），
            // 继续走下方重新拉取逻辑，确保拿到真实数据（与 useInfiniteScroll 一致）。
            if (localVer && localVer === serverVer) {
              const c = readPageCache(name, 1, currentUserId);
              if (c && c.data.length > 0) {
                return { name, data: c.data };
              }
            }

            // 版本不一致 / 无本地版本 → 重新拉取
            try {
              const result = await fetchFn();
              if (cancelled) return { name, data: [] as unknown[] };

              // ✅ 验证返回数据：防止 malformed response（如 401 返回 { error: "..." }）
              if (!Array.isArray(result?.data)) {
                console.warn(`[useDataCache] ${name} fetch 返回格式异常，回退缓存`);
                const c = readPageCache(name, 1, currentUserId);
                return { name, data: c?.data || [] };
              }

              writePageCache(name, 1, result.data, result.total, serverVer || 1, currentUserId);
              setLocalVersion(localVersionKey, serverVer || 1, currentUserId);
              return { name, data: result.data };
            } catch {
              // 拉取失败，回退到缓存
              const c = readPageCache(name, 1, currentUserId);
              return { name, data: c?.data || [] };
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
    syncDataRef.current = syncData;

    const init = async () => {
      // 优先用 lazy init 时已有的数据，若无缓存再同步读取
      const cached = readCached();
      // 仅当 lazy init 无缓存而 effect 阶段读到缓存时，才更新状态
      if (Object.keys(cached).length > 0 && !cancelled) {
        setAllData((prev) => {
          // 如果 lazy init 已读取了同一份数据（引用相同），跳过更新
          const hasNew = Object.keys(cached).some((key) => !(key in prev) || prev[key] !== cached[key]);
          return hasNew ? cached : prev;
        });
        setLoading(false);
      }

      // 2. 后台比对版本号，按需拉取
      await syncData();
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [uid]); // userId 变化时重新初始化缓存

  // ===== 跨页面实时同步：订阅同表数据变更广播，版本不一致时真正重拉 =====

  useEffect(() => {
    const onTableChanged = async (table: string) => {
      const cfgs = configsRef.current;
      const currentUserId = userIdRef.current || null;
      // 广播的 table 是表级全量 key（如 Link / Category）：
      // 匹配 versionTable/name 相同，或显式 subscribe 声明的联动表
      const matched = cfgs.filter(
        (c) =>
          (c.versionTable || c.name) === table ||
          c.name === table ||
          c.subscribe?.includes(table)
      );
      if (matched.length === 0) return; // 本 hook 不关心该表

      // 任一匹配表服务端版本已变化才真正重拉（写方自身未同步本地版本，会命中"不一致"触发）
      let needsSync = false;
      for (const cfg of matched) {
        const versionKey = cfg.versionTable || cfg.name;
        // 版本比对使用按视图隔离的本地版本号（避免与其他视图共享同一版本号导致误判）
        const localVersionKey = `${versionKey}__view__${cfg.name}`;
        const serverVer = await getServerVersion(versionKey);
        const localVer = getLocalVersion(localVersionKey, currentUserId);
        if (serverVer && serverVer !== localVer) {
          needsSync = true;
          break;
        }
      }
      if (!needsSync) return;
      // 版本不一致 → 重新拉取（syncData 拉取后统一写入本地版本）
      await syncDataRef.current();
    };
    return subscribeDataChanged(onTableChanged);
  }, []); // 依赖 configsRef/userIdRef/syncDataRef（均为 ref，稳定）

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
