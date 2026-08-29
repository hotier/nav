"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { subscribeDataChanged } from "@/lib/cache-client";

// 模块级内存缓存：客户端路由切换时 layout 会重挂载，hook 状态重置，
// 但模块级变量保留，可立即返回真实头像，避免闪默认头像后再延迟加载
let memAvatarUrl: string | null = null;

// 每个浏览器会话（一次页面加载）最多回源校验一次，之后靠 User 变更广播失效。
// 这样路由切换重挂载不再发起请求，直接复用缓存；刷新/冷启动时仍有一次校准机会
let didSyncThisSession = false;

// server 端不执行 layout effect（避免 SSR 警告），client 端在浏览器绘制前同步刷新，
// 消除"先渲染默认头像、再换成真实头像"的一帧闪烁
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** 读取头像缓存：内存优先，其次 localStorage（刷新页面后也能立即显示） */
function readCachedAvatar(uid: string | undefined): string | null {
  if (memAvatarUrl) return memAvatarUrl;
  if (!uid) return null;
  // SSR 阶段无 localStorage
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`nav:user-avatar:${uid}`);
    if (raw) {
      const data = JSON.parse(raw) as { url: string | null };
      return data.url;
    }
  } catch {
    // 缓存损坏时忽略
  }
  return null;
}

/** 写入头像缓存（内存 + localStorage 双层） */
function writeCachedAvatar(uid: string | undefined, url: string | null) {
  memAvatarUrl = url;
  if (!uid || typeof window === "undefined") return;
  try {
    localStorage.setItem(`nav:user-avatar:${uid}`, JSON.stringify({ url }));
  } catch {
    // 存储不可用时忽略（内存缓存仍生效）
  }
}

/**
 * 当前用户头像 URL —— 缓存优先、事件驱动失效，数据库仅作兜底校准。
 *
 * 背景：顶部导航栏此前直接渲染 session.user.image（JWT 登录时的快照），
 * 用户在「账户管理」输入 URL 保存头像后，JWT 快照未必及时同步，导致顶部
 * 导航栏仍显示字母占位，与账户管理/用户管理（两者均读数据库）不一致。
 *
 * 策略（与 cache-client 的"缓存直渲 + 版本/事件失效"一致）：
 * - 内存 + localStorage 双层缓存：切换路由 / 刷新页面时先用缓存立即渲染，
 *   期间不发起请求，避免"先默认头像、后加载真实头像"的闪烁
 * - 每个会话仅首次挂载回源一次 /api/account 校准（覆盖刷新后无广播历史）；
 *   之后头像变更靠广播失效：订阅 "User" 表变更（跨页面）+ 本地事件（同页面）
 * - 数据库值已确认（含"已清空头像"的 null）时以数据库为准；
 *   尚未确认时才用 session 兜底
 * - 返回 null 表示当前无头像，调用方渲染字母占位
 */
export function useUserAvatar(): string | null {
  const { data: session } = useSession();
  const sessionImage = session?.user?.image ?? null;
  const uid = session?.user?.id;

  // loaded=true 表示数据库值已确认（含 null），此时不再以 session 兜底
  const [dbImage, setDbImage] = useState<{ loaded: boolean; value: string | null }>(
    () => ({ loaded: !!readCachedAvatar(uid), value: readCachedAvatar(uid) })
  );

  // 路由切换重挂载 / 账号切换后，在浏览器绘制前同步恢复缓存头像：
  // 此时 useState 初始值已读内存缓存，此 effect 兜底 localStorage 场景（刷新页面）
  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const cached = readCachedAvatar(uid);
    setDbImage({ loaded: !!cached, value: cached });
  }, [uid]);

  const fetchDbImage = useCallback(async () => {
    if (!uid) return;
    try {
      const res = await fetch("/api/account");
      if (!res.ok) return;
      const data = (await res.json()) as { image?: string | null };
      if (data && "image" in data) {
        const img = data.image ?? null;
        writeCachedAvatar(uid, img);
        setDbImage({ loaded: true, value: img });
      }
    } catch {
      // 网络异常保持现状，不阻塞 UI
    }
  }, [uid]);

  useEffect(() => {
    // 每个会话仅首次挂载（且已拿到 uid）回源校准一次，覆盖刷新/冷启动；
    // 路由切换重挂载时 didSyncThisSession 已为 true，直接复用缓存不再请求
    if (!didSyncThisSession && uid) {
      didSyncThisSession = true;
      void fetchDbImage();
    }

    // 跨页面：任一页面变更用户信息（头像/名称）后即时刷新
    const unsubscribe = subscribeDataChanged((table) => {
      if (table === "User") void fetchDbImage();
    });

    // 同页面：BroadcastChannel 与 storage 事件都不回传发送方，账户管理保存头像后
    // 写方会额外派发此事件，保证当前页顶部导航栏头像即时刷新
    const onLocalUpdate = () => void fetchDbImage();
    window.addEventListener("nav:user-updated", onLocalUpdate);

    return () => {
      unsubscribe();
      window.removeEventListener("nav:user-updated", onLocalUpdate);
    };
  }, [fetchDbImage, uid]);

  // 数据库（含缓存）已确认 → 以它为准（null 即字母占位）；
  // 尚未确认 → 缓存优先，session 兜底
  if (dbImage.loaded) return dbImage.value;
  return dbImage.value ?? sessionImage;
}
