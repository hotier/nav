"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// 全局事件（Map<Symbol> → HMR 安全）
// ---------------------------------------------------------------------------

type Listener = () => void;
const listenerMap = new Map<symbol, { start: Listener; done: Listener }>();

function register(id: symbol, start: Listener, done: Listener) {
  listenerMap.set(id, { start, done });
  return () => listenerMap.delete(id);
}

/** 手动启动（如数据请求开始前调用） */
export function startTopLoader() {
  listenerMap.forEach(({ start }) => start());
}
/** 手动完成：可见时跳到 100% 再淡出，延迟阶段直接取消 */
export function doneTopLoader() {
  listenerMap.forEach(({ done }) => done());
}

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------

const SHOW_DELAY = 600; // ms — 加载低于此值进度条不出现
const ANIM_DURATION = 1200; // ms — 进度条出现后 0→100% 时长

export function TopLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [width, setWidth] = useState(0);
  const [opacity, setOpacity] = useState(0);

  const instanceId = useRef(Symbol("TopLoader"));
  const runId = useRef(0);
  const rafId = useRef(0);
  const delayTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  const fadeTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  const resetTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  const visibleRef = useRef(false);

  // ---- finish：中断当前动画（路由切换清理用，从当前位置快速淡出） ----
  const finish = useCallback(() => {
    clearTimeout(delayTimer.current);
    runId.current += 1;
    cancelAnimationFrame(rafId.current);

    if (visibleRef.current) {
      visibleRef.current = false;
      setOpacity(0);
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setWidth(0), 200);
    }
  }, []);

  // ---- complete：页面加载完毕信号 ----
  // 延迟期（不可见）→ 取消计时器，进度条从不出现
  // 动画期（可见）   → 跳到 100% 再淡出
  const complete = useCallback(() => {
    clearTimeout(delayTimer.current);
    runId.current += 1;
    cancelAnimationFrame(rafId.current);

    if (visibleRef.current) {
      visibleRef.current = false;
      setWidth(100);
      clearTimeout(fadeTimer.current);
      clearTimeout(resetTimer.current);
      fadeTimer.current = setTimeout(() => setOpacity(0), 150);
      resetTimer.current = setTimeout(() => setWidth(0), 350);
    }
  }, []);

  // ---- run：启动（600ms 静默 → 达到阈值才启动可见动画） ----
  const run = useCallback(() => {
    // 执行锁：先终止前一次
    runId.current += 1;
    cancelAnimationFrame(rafId.current);
    clearTimeout(delayTimer.current);
    clearTimeout(fadeTimer.current);
    clearTimeout(resetTimer.current);

    const currentRunId = runId.current;
    visibleRef.current = false;
    setOpacity(0);
    setWidth(0);

    // 延迟阈值：达到后才启动可见动画
    delayTimer.current = setTimeout(() => {
      if (runId.current !== currentRunId) return; // 已被终止

      visibleRef.current = true;
      setOpacity(1);
      const animStart = performance.now();

      const tick = () => {
        if (runId.current !== currentRunId) return;
        const p = Math.min((performance.now() - animStart) / ANIM_DURATION, 1);
        // easeOutQuad：快起步，近终点平滑减速
        setWidth((1 - (1 - p) * (1 - p)) * 100);

        if (p < 1) {
          rafId.current = requestAnimationFrame(tick);
        } else {
          // 自然完成
          visibleRef.current = false;
          fadeTimer.current = setTimeout(() => setOpacity(0), 200);
          resetTimer.current = setTimeout(() => setWidth(0), 400);
        }
      };
      rafId.current = requestAnimationFrame(tick);
    }, SHOW_DELAY);
  }, []);

  // ====== 路由监听 ======
  useEffect(() => {
    run();
    return () => finish();
  }, [pathname, searchParams, run, finish]);

  // ====== 全局事件注册 ======
  useEffect(() => {
    const unregister = register(instanceId.current, run, complete);
    return () => {
      unregister();
      complete();
    };
  }, [run, complete]);

  // ====== 最终卸载兜底 ======
  useEffect(() => {
    return () => {
      clearTimeout(delayTimer.current);
      clearTimeout(fadeTimer.current);
      clearTimeout(resetTimer.current);
      runId.current += 1;
      cancelAnimationFrame(rafId.current);
    };
  }, []);

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(width)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="fixed inset-x-0 top-0 z-[9999] pointer-events-none"
      style={{
        opacity,
        transition: "opacity 200ms ease-out",
      }}
    >
      <div
        className="h-[1.5px] origin-left"
        style={{
          width: `${width}%`,
          background: "var(--color-primary)",
          boxShadow: opacity > 0 ? "0 0 4px var(--color-primary)" : "none",
        }}
      />
    </div>
  );
}
