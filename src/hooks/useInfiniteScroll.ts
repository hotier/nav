/**
 * useInfiniteScroll — 无限滚动加载 Hook
 *
 * 支持：
 *   - 缓存优先渲染（readPageCache / writePageCache）
 *   - IntersectionObserver 触底加载下一页
 *   - 乐观更新（setItems）
 *   - 后台版本同步
 *
 * 用法：
 *   const { items, hasMore, isLoadingMore, sentinelRef, setItems, total } = useInfiniteScroll<LinkType>({
 *     name: "Link",
 *     fetchFn: (page) => fetch(`/api/links?includePrivate=true&page=${page}&pageSize=20`)
 *       .then(r => r.json())
 *       .then(d => ({ data: d.data, total: d.total })),
 *   });
 */

"use client";

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import {
  readPageCache,
  writePageCache,
  getLocalVersion,
  getServerVersion,
} from "@/lib/cache-client";

// ==================== 类型定义 ====================

interface PageResult<T> {
  data: T[];
  total: number;
}

/** 自适应视口配置 */
interface AutoPageSizeConfig {
  /** 单个卡片预估高度（含 gap），默认 140 */
  cardHeight?: number;
  /** 每行列数（数字或根据宽度返回列数的函数），默认 4 */
  columns?: number | (() => number);
  /** 额外缓冲行数（触底前提前加载），默认 2 */
  bufferRows?: number;
}

interface UseInfiniteScrollOptions<T> {
  /** 缓存表名（对应 localStorage key） */
  name: string;
  /** 分页拉取函数，传入页码返回 { data, total }；pageSize 通过第二个参数动态传入 */
  fetchFn: (page: number, pageSize: number) => Promise<PageResult<T>>;
  /** 每页条数，默认 20；若启用 autoPageSize 则此值作为兜底 */
  pageSize?: number;
  /** 根据视口自动计算 pageSize */
  autoPageSize?: boolean | AutoPageSizeConfig;
  /** 用户 ID，用于 localStorage 命名空间隔离，防切换账号残留缓存 */
  userId?: string | null;
}

interface UseInfiniteScrollReturn<T> {
  /** 已加载的所有条目 */
  items: T[];
  /** 总数（服务端返回的 total） */
  total: number;
  /** 是否还有更多页 */
  hasMore: boolean;
  /** 正在加载下一页 */
  isLoadingMore: boolean;
  /** 首次/同步加载中 */
  loading: boolean;
  /** 绑定到列表末尾哨兵元素的 ref */
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  /** 乐观更新（增删改后立即更新 UI） */
  setItems: (updater: (prev: T[]) => T[]) => void;
  /** 手动重新从第一页开始加载 */
  refresh: () => void;
}

// ==================== 工具函数 ====================

/** 根据视口计算需要的条目数 */
function calcViewportPageSize(config: AutoPageSizeConfig): number {
  const cardHeight = config.cardHeight ?? 140;
  const bufferRows = config.bufferRows ?? 2;
  const columns =
    typeof config.columns === "function"
      ? config.columns()
      : config.columns ?? 4;

  const vh = window.innerHeight;
  const rows = Math.ceil(vh / cardHeight) + bufferRows;
  return Math.max(columns * 2, rows * columns); // 最少 2 行
}

/** 解析 autoPageSize 配置 */
function resolveAutoConfig(opt: boolean | AutoPageSizeConfig | undefined): AutoPageSizeConfig | null {
  if (!opt) return null;
  if (opt === true) return {};
  return opt;
}

// ==================== Hook 实现 ====================

export function useInfiniteScroll<T>({
  name,
  fetchFn,
  pageSize: initialPageSize = 20,
  autoPageSize,
  userId,
}: UseInfiniteScrollOptions<T>): UseInfiniteScrollReturn<T> {
  const [items, setItemsState] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // 当前生效的 pageSize（初始化后不再变，避免翻页过程中跳变）
  const pageSizeRef = useRef(initialPageSize);

  // 记录当前页码和是否还有更多
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false); // 防止重复加载
  const manualRef = useRef(false); // 标记是否有手动 setItems 调用

  // IntersectionObserver 哨兵
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  // 缓存表名：autoPageSize 时包含 pageSize 后缀，避免跨视口缓存污染
  const cacheNameRef = useRef(name);

  // ===== 视口自适应：在 layout effect 中计算（此时 DOM 已就绪）=====
  useLayoutEffect(() => {
    const autoConfig = resolveAutoConfig(autoPageSize);
    if (autoConfig) {
      const ps = calcViewportPageSize(autoConfig);
      pageSizeRef.current = ps;
      cacheNameRef.current = `${name}_ps${ps}`;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 存 userId 引用
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const uidDep = userId || null;

  // ===== 初始化：缓存优先 + 后台同步 =====
  useEffect(() => {
    let cancelled = false;

    const setHasMoreBoth = (v: boolean) => {
      hasMoreRef.current = v;
      if (!cancelled) setHasMore(v);
    };

    const init = async () => {
      const ps = pageSizeRef.current;
      const cacheName = cacheNameRef.current;
      const currentUserId = userIdRef.current || null;

      // 1. 读取第一页缓存，立即渲染
      const cached = readPageCache<T>(cacheName, 1, currentUserId);
      if (cached && cached.data.length > 0 && !cancelled) {
        setItemsState(cached.data);
        setTotal(cached.total);
        setLoading(false);
        pageRef.current = 1;
        // 如果缓存数据量 === pageSize，可能有更多数据，保守设为 true
        const mightBeMoreFromCache = cached.data.length >= ps || cached.data.length < cached.total;
        setHasMoreBoth(mightBeMoreFromCache);
      }

      // 2. 后台比对版本号（版本号基于原始表名，不含 pageSize 后缀）
      try {
        const serverVer = await getServerVersion(name);
        const localVer = getLocalVersion(name, currentUserId);

        if (localVer && localVer === serverVer) {
          // 版本一致，用缓存
          if (!cached || cached.data.length === 0) {
            if (!cancelled) {
              setItemsState([]);
              setTotal(0);
              setLoading(false);
              setHasMoreBoth(false);
            }
          } else {
            // 缓存有效，但需要根据真实 total 重新判断 hasMore
            setHasMoreBoth(cached.data.length < cached.total);
          }
          // 关键：如果 hasMore 但首屏未填满 → 立即预加载下一页
          if (hasMoreRef.current && cached && cached.data.length > 0) {
            schedulePreload();
          }
          return;
        }

        // 版本不一致或无本地版本 → 重新拉取第一页
        const result = await fetchFnRef.current(1, ps);
        if (cancelled) return;

        if (!Array.isArray(result?.data)) {
          console.warn(`[useInfiniteScroll] ${name} 返回格式异常，回退缓存`);
          if (!cancelled) setLoading(false);
          return;
        }

        writePageCache(cacheName, 1, result.data, result.total, serverVer || 1, currentUserId);
        if (!cancelled) {
          setItemsState(result.data);
          setTotal(result.total);
          setHasMoreBoth(result.data.length < result.total);
          pageRef.current = 1;
          setLoading(false);

          // 预加载下一页
          if (hasMoreRef.current) {
            schedulePreload();
          }
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    // 延迟预加载，等状态更新、DOM 渲染后再加载
    const schedulePreload = () => {
      setTimeout(() => {
        if (!cancelled && hasMoreRef.current && !loadingRef.current) {
          loadNextPage();
        }
      }, 100);
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [name, uidDep]);

  // ===== IntersectionObserver：触底加载 =====
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMoreRef.current && !loadingRef.current) {
          loadNextPage();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [items.length]); // items 变化时重新绑定（sentinel 位置可能变化）

  const loadNextPage = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    setIsLoadingMore(true);

    const nextPage = pageRef.current + 1;
    const ps = pageSizeRef.current;
    const cacheName = cacheNameRef.current;
    const currentUserId = userIdRef.current || null;

    try {
      const result = await fetchFnRef.current(nextPage, ps);

      if (!Array.isArray(result?.data)) {
        console.warn(`[useInfiniteScroll] ${name} 第 ${nextPage} 页格式异常`);
        return;
      }

      const serverVer = await getServerVersion(name);
      writePageCache(cacheName, nextPage, result.data, result.total, serverVer || 1, currentUserId);

      setItemsState((prev) => {
        const merged = [...prev, ...result.data];
        const stillMore = merged.length < result.total;
        hasMoreRef.current = stillMore;
        setHasMore(stillMore);
        return merged;
      });
      setTotal(result.total);
      pageRef.current = nextPage;
    } catch {
      // 加载失败，稍后重试
    } finally {
      loadingRef.current = false;
      setIsLoadingMore(false);
    }
  }, [name]);

  // ===== 手动更新（乐观 CRUD）=====
  const setItems = useCallback((updater: (prev: T[]) => T[]) => {
    manualRef.current = true;
    setItemsState(updater);
  }, []);

  const refresh = useCallback(async () => {
    const ps = pageSizeRef.current;
    const cacheName = cacheNameRef.current;
    const currentUserId = userIdRef.current || null;
    try {
      setLoading(true);
      const result = await fetchFnRef.current(1, ps);
      if (!Array.isArray(result?.data)) return;

      const serverVer = await getServerVersion(name);
      writePageCache(cacheName, 1, result.data, result.total, serverVer || 1, currentUserId);

      const stillMore = result.data.length < result.total;
      setItemsState(result.data);
      setTotal(result.total);
      hasMoreRef.current = stillMore;
      setHasMore(stillMore);
      pageRef.current = 1;
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [name]);

  return {
    items,
    total,
    hasMore,
    isLoadingMore,
    loading,
    sentinelRef,
    setItems,
    refresh,
  };
}
