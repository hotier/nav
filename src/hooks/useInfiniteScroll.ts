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
  setLocalVersion,
  subscribeDataChanged,
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
  /** 版本号用的表级 key（默认取 name）。当 name 带维度（如 Link:category:xxx）时，
   *  应传表级 key（如 "Link"），保证一次数据变更能让所有同表页面缓存一起失效 */
  versionTable?: string;
  /** 是否启用加载。为 false 时不初始化/不拉取/不写缓存/不订阅广播（loading 恒 true）。
   *  适用于依赖前置数据（如分类定位）才能确定查询参数的场景：
   *  避免在参数未就绪时用错误参数（如空 categoryId）拉取全量数据并污染缓存。 */
  enabled?: boolean;
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

/** 返回固定分页数：桌面 40，移动 20 */
function calcViewportPageSize(_config: AutoPageSizeConfig): number {
  return window.innerWidth >= 768 ? 40 : 20;
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
  versionTable,
  fetchFn,
  pageSize: initialPageSize = 20,
  autoPageSize,
  userId,
  enabled = true,
}: UseInfiniteScrollOptions<T>): UseInfiniteScrollReturn<T> {
  // 版本号 key：默认用 name；带维度（如 Link:category:xxx）时用表级 versionTable，
  // 保证数据变更（incrementTableVersion("Link")）能联动失效所有同表页面缓存
  const versionKey = versionTable || name;

  // 本地版本号按「视图」隔离（表级版本号 + 视图名），避免多视图互相覆盖：
  // 若共享同一个本地版本号，首页重拉后 setLocalVersion 会把版本同步到最新，
  // 分类页（Link:category:* 旧缓存）会误以为自己的缓存也是最新的而跳过重拉 → 数据不同步。
  // 各视图独立记录「最后一次拉取时的服务端版本」，服务端版本更新时各自触发重拉。
  const localVersionKey = `${versionKey}__view__${name}`;
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
  const prefetchingRef = useRef(false); // 防止重复预取同一页

  // IntersectionObserver 哨兵
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // 持久化 observer 实例（避免频繁销毁重建）
  const observerRef = useRef<IntersectionObserver | null>(null);

  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  // loadNextPage 引用，避免闭包陈旧问题
  const loadNextPageRef = useRef<() => Promise<void>>(async () => {});


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

  // 存 enabled 引用：入口处即时判断，避免闭包拿到旧值
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const uidDep = userId || null;

  // ===== prefetchNextPage：静默预取下一页写入缓存（不追加到 items）=====
  // 提升翻页顺畅度：当前页加载完后，后台预取下一页，滚动到下一页时数据已在缓存。
  async function prefetchNextPage(): Promise<void> {
    if (prefetchingRef.current) return; // 防止重复预取
    const nextPage = pageRef.current + 1;
    const ps = pageSizeRef.current;
    const cacheName = cacheNameRef.current;
    const currentUserId = userIdRef.current || null;
    // 下一页会与当前页拼接在 items 中，若已在 items 范围内则无需预取
    if (nextPage * ps <= pageRef.current * ps) return;
    prefetchingRef.current = true;
    try {
      const result = await fetchFnRef.current(nextPage, ps);
      if (Array.isArray(result?.data)) {
        const serverVer = await getServerVersion(versionKey);
        writePageCache(cacheName, nextPage, result.data, result.total, serverVer || 1, currentUserId);
      }
    } catch {
      // 预取失败静默，交给后续滚动触发
    } finally {
      prefetchingRef.current = false;
    }
  }

  // ===== loadNextPage：使用 ref 确保所有闭包拿到最新引用 =====
  const loadNextPage = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current || !enabledRef.current) return;
    loadingRef.current = true;
    setIsLoadingMore(true);

    const nextPage = pageRef.current + 1;
    const ps = pageSizeRef.current;
    const cacheName = cacheNameRef.current;
    const currentUserId = userIdRef.current || null;

    try {
      // 缓存优先：预取已写入的下一页缓存可直接使用，避免网络等待，翻页更顺畅
      const cached = readPageCache<T>(cacheName, nextPage, currentUserId);
      let result: PageResult<T>;
      if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
        result = { data: cached.data, total: cached.total };
      } else {
        const fetched = await fetchFnRef.current(nextPage, ps);
        if (!Array.isArray(fetched?.data)) {
          console.warn(`[useInfiniteScroll] ${name} 第 ${nextPage} 页格式异常`);
          return;
        }
        result = fetched;
        const serverVer = await getServerVersion(versionKey);
        writePageCache(cacheName, nextPage, result.data, result.total, serverVer || 1, currentUserId);
        setLocalVersion(localVersionKey, serverVer || 1, currentUserId); // 同步本视图版本号
      }

      // 基于页码与总量计算是否还有更多（不在 updater 内修改 ref/state，保证 React 19 下稳定）
      const stillMore = nextPage * ps < result.total || result.data.length >= ps;
      pageRef.current = nextPage;
      hasMoreRef.current = stillMore;
      setHasMore(stillMore);

      setItemsState((prev) => [...prev, ...result.data]);
      setTotal(result.total);

      // 预加载增强：当前页加载完且还有更多时，静默预取下一页写入缓存，
      // 用户滚动到下一页时数据已在缓存，翻页无缝衔接。
      if (stillMore && !loadingRef.current) {
        void prefetchNextPage();
      }
    } catch {
      // 加载失败，稍后重试
    } finally {
      loadingRef.current = false;
      setIsLoadingMore(false);
    }
  }, [name]);

  // 始终保持 loadNextPageRef 指向最新的 loadNextPage
  loadNextPageRef.current = loadNextPage;

  // ===== 初始化：缓存优先 + 后台同步 =====
  useEffect(() => {
    // enabled=false：查询参数未就绪（如分类页 categoryId 未定位），不初始化——
    // 不拉取、不写缓存、不同步版本号。若此时用错误参数（如空 categoryId）拉取，
    // 会拿到全量数据污染本视图缓存，并在参数就绪后泄漏到渲染（历史 bug）。
    if (!enabled) return;
    let cancelled = false;

    // name/enabled 变化导致重新初始化时，重置所有状态：
    // 防止旧 name（如 pending 占位）的数据泄漏到新视图
    setItemsState([]);
    setTotal(0);
    setLoading(true);
    pageRef.current = 1;
    hasMoreRef.current = true;
    setHasMore(true);

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

      // 2. 后台比对版本号（服务端版本基于表级 versionKey；本地版本按视图隔离）
      try {
        const serverVer = await getServerVersion(versionKey);
        const localVer = getLocalVersion(localVersionKey, currentUserId);

        if (localVer && localVer === serverVer) {
          // 版本一致 → 用缓存。但缓存为空时不能直接信任（可能是历史瞬时错误写入的空缓存），
          // 应继续走重新拉取逻辑，确保拿到真实数据。
          if (cached && cached.data.length > 0) {
            // 缓存有效：第一页已满说明可能还有更多，保守设为 true
            setHasMoreBoth(cached.data.length >= ps || cached.data.length < cached.total);
            // 如果 hasMore 但首屏未填满 → 立即预加载下一页
            if (hasMoreRef.current) {
              schedulePreload();
            }
            return;
          }
          // 缓存为空：不 return，继续执行下方的重新拉取（避免空缓存被当作有效）
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
        setLocalVersion(localVersionKey, serverVer || 1, currentUserId); // 同步本视图版本号
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

    // 延迟预加载，等状态更新、DOM 渲染后再加载（通过 ref 获取最新 loadNextPage）
    const schedulePreload = () => {
      setTimeout(() => {
        if (!cancelled && hasMoreRef.current && !loadingRef.current) {
          loadNextPageRef.current();
        }
      }, 100);
    };

    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, uidDep, enabled]);

  // ===== IntersectionObserver + 滚动兜底：触底加载 =====
  // 创建 observer（只依赖 name，创建一次）
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMoreRef.current && !loadingRef.current) {
          loadNextPageRef.current();
        }
      },
      { rootMargin: "400px" }
    );

    observerRef.current = observer;

    // 方案2：滚动事件兜底（部分环境 IntersectionObserver 可能不触发）
    let throttling = false;
    const handleScroll = () => {
      if (throttling || !hasMoreRef.current || loadingRef.current) return;
      throttling = true;
      requestAnimationFrame(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) { throttling = false; return; }
        const rect = sentinel.getBoundingClientRect();
        // sentinel 距离视口底部 400px 以内 → 触发加载
        if (rect.top < window.innerHeight + 400) {
          loadNextPageRef.current();
        }
        throttling = false;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      observer.disconnect();
      observerRef.current = null;
      window.removeEventListener("scroll", handleScroll);
    };
  }, [name]); // 只依赖 name，通过 ref 获取最新值

  // 当 items 变化（sentinel 位置改变）时，重新 observe
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const observer = observerRef.current;
    if (!sentinel || !observer) return;

    // reconnect：先 unobserve 再 observe，使 IntersectionObserver 重新计算位置
    observer.unobserve(sentinel);
    observer.observe(sentinel);
  }, [items.length]);

  // ===== 手动更新（乐观 CRUD）=====
  const setItems = useCallback((updater: (prev: T[]) => T[]) => {
    manualRef.current = true;
    setItemsState(updater);
  }, []);

  const refresh = useCallback(async () => {
    if (!enabledRef.current) return; // 参数未就绪，不应拉取
    const ps = pageSizeRef.current;
    const cacheName = cacheNameRef.current;
    const currentUserId = userIdRef.current || null;
    try {
      setLoading(true);
      const result = await fetchFnRef.current(1, ps);
      if (!Array.isArray(result?.data)) return;

      const serverVer = await getServerVersion(versionKey);
      writePageCache(cacheName, 1, result.data, result.total, serverVer || 1, currentUserId);
      setLocalVersion(localVersionKey, serverVer || 1, currentUserId); // 同步本视图版本号

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

  // ===== 跨页面实时同步：订阅同表数据变更广播，触发重新拉取 =====
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    // enabled=false：参数未就绪，不订阅广播（避免用错误参数触发 refresh）
    if (!enabled) return;
    // 收到广播时，只响应本表（versionKey）相关的变更，避免无谓重拉。
    // 链接相关表（Link / Link:category:* / Link:mgmt:v2 等）统一响应 "Link" 广播，
    // 保证任意页面改链接，所有链接页面都能实时同步。
    const tableMatcher = (table: string) => {
      const isLinkFamily =
        table === "Link" ||
        versionKey === table ||
        name === table ||
        (table === "Link" && (versionKey === "Link" || versionKey.startsWith("Link:")));
      if (!isLinkFamily) return;
      // 版本号已变化才真正重拉（写方自身未同步本视图版本号，会命中“版本不一致”触发）
      const currentUserId = userIdRef.current || null;
      getServerVersion(versionKey).then((serverVer) => {
        const localVer = getLocalVersion(localVersionKey, currentUserId);
        if (serverVer && serverVer !== localVer) {
          // 从第一页重新拉取，保证数据与最新版本对齐
          void refreshRef.current();
        }
      });
    };
    const unsubscribe = subscribeDataChanged(tableMatcher);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionKey, name, enabled]);

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
