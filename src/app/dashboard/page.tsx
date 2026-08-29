"use client";

import React from "react";
import { useSession } from "next-auth/react";
import { AdminLayout } from "@/components/AdminLayout";
import { Link2, Folder, Globe, Lock, Sparkles, Zap, Archive } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useDataCache } from "@/hooks/useDataCache";

interface DashboardStats {
  totalLinks: number;
  totalCategories: number;
  publicLinks: number;
  privateLinks: number;
}

const EMPTY: DashboardStats = { totalLinks: 0, totalCategories: 0, publicLinks: 0, privateLinks: 0 };

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const uid = session?.user?.id;

  const { data: cacheData, loading } = useDataCache({
    configs: [
    {
      name: "DashboardStats",
      // 统计随 Link/Category/User 数据变化，订阅这些表的广播实时刷新
      subscribe: ["Link", "Category", "User"],
      fetch: () =>
        fetch("/api/dashboard/stats")
          .then((r) => r.json())
          .then((d: DashboardStats) => ({ data: [d], total: 1 })),
    },
  ], userId: uid });

  const stats: DashboardStats = (cacheData["DashboardStats"]?.[0] as DashboardStats) || EMPTY;

  if (status === "loading") return null;

  if (!session) return null;

  const isEmpty = stats.totalLinks === 0 && stats.totalCategories === 0;

  return (
    <AdminLayout stats={stats}>

      <div className="dashboard-container space-y-8">
        {/* Stats Grid */}
        {loading && isEmpty ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="stat-card p-6 animate-pulse">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-muted" />
                  <div className="h-5 w-12 rounded-full bg-muted" />
                </div>
                <div className="h-9 w-16 rounded bg-muted mb-2" />
                <div className="h-4 w-20 rounded bg-muted" />
                <div className="mt-4 pt-4 border-t border-border/50">
                  <div className="h-4 w-full rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : (
        <div className="stagger-grid grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {/* Total Links */}
          <div className="stat-card p-6" style={{ "--icon-color": "#3b82f6" } as React.CSSProperties}>
            <div className="flex items-start justify-between mb-4">
              <div className="stat-icon-wrapper" style={{ background: "rgba(59, 130, 246, 0.1)", "--icon-color": "#3b82f6" } as React.CSSProperties}>
                <Link2 className="h-6 w-6 text-primary" style={{ color: "#3b82f6" }} />
              </div>
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-primary/10 text-primary dark:text-primary">
                链接
              </span>
            </div>
            <div className="text-3xl font-bold mb-1 tracking-tight" style={{ fontFamily: "var(--font-space-grotesk)" }}>
              {stats.totalLinks}
            </div>
            <p className="text-sm text-muted-foreground">总链接数</p>
            <div className="mt-4 pt-4 border-t border-border/50">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">分布</span>
                <span className="font-medium">{stats.publicLinks} 公开 · {stats.privateLinks} 私有</span>
              </div>
            </div>
          </div>

          {/* Categories */}
          <div className="stat-card p-6" style={{ "--icon-color": "#8b5cf6" } as React.CSSProperties}>
            <div className="flex items-start justify-between mb-4">
              <div className="stat-icon-wrapper" style={{ background: "rgba(139, 92, 246, 0.1)" } as React.CSSProperties}>
                <Folder className="h-6 w-6 text-violet-500" style={{ color: "#8b5cf6" }} />
              </div>
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400">
                分类
              </span>
            </div>
            <div className="text-3xl font-bold mb-1 tracking-tight" style={{ fontFamily: "var(--font-space-grotesk)" }}>
              {stats.totalCategories}
            </div>
            <p className="text-sm text-muted-foreground">分类总数</p>
            <div className="mt-4 pt-4 border-t border-border/50">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Archive className="h-3 w-3" />
                <span>有序管理书签</span>
              </div>
            </div>
          </div>

          {/* Public Links */}
          <div className="stat-card p-6" style={{ "--icon-color": "#10b981" } as React.CSSProperties}>
            <div className="flex items-start justify-between mb-4">
              <div className="stat-icon-wrapper" style={{ background: "rgba(16, 185, 129, 0.1)" } as React.CSSProperties}>
                <Globe className="h-6 w-6 text-success" style={{ color: "var(--color-success)" }} />
              </div>
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-success/10 text-success-muted-foreground">
                公开
              </span>
            </div>
            <div className="text-3xl font-bold mb-1 tracking-tight" style={{ fontFamily: "var(--font-space-grotesk)" }}>
              {stats.publicLinks}
            </div>
            <p className="text-sm text-muted-foreground">公开链接</p>
            <div className="mt-4 pt-4 border-t border-border/50">
              <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-500"
                  style={{ width: `${stats.totalLinks ? (stats.publicLinks / stats.totalLinks) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>

          {/* Private Links */}
          <div className="stat-card p-6" style={{ "--icon-color": "#f59e0b" } as React.CSSProperties}>
            <div className="flex items-start justify-between mb-4">
              <div className="stat-icon-wrapper" style={{ background: "rgba(245, 158, 11, 0.1)" } as React.CSSProperties}>
                <Lock className="h-6 w-6 text-warning" style={{ color: "var(--color-warning)" }} />
              </div>
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-warning/10 text-warning-muted-foreground">
                私有
              </span>
            </div>
            <div className="text-3xl font-bold mb-1 tracking-tight" style={{ fontFamily: "var(--font-space-grotesk)" }}>
              {stats.privateLinks}
            </div>
            <p className="text-sm text-muted-foreground">私有链接</p>
            <div className="mt-4 pt-4 border-t border-border/50">
              <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full transition-all duration-500"
                  style={{ width: `${stats.totalLinks ? (stats.privateLinks / stats.totalLinks) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Quick Actions */}
        <div className="animate-fade-in-up delay-300">
          <div className="flex items-center gap-2 mb-5">
            <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-space-grotesk)" }}>快捷操作</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Link href="/dashboard/links" className="block">
              <div
                className="action-card group cursor-pointer"
                style={{ "--accent-color": "#3b82f6" } as React.CSSProperties}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Link2 className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1 group-hover:text-primary transition-colors" style={{ fontFamily: "var(--font-space-grotesk)" }}>链接管理</h3>
                    <p className="text-sm text-muted-foreground">添加、编辑、删除和整理你的书签链接</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  <span>开始管理</span>
                  <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>

            <Link href="/dashboard/categories" className="block">
              <div 
                className="action-card group cursor-pointer"
                style={{ "--accent-color": "#8b5cf6" } as React.CSSProperties}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Folder className="h-6 w-6 text-violet-500" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1 group-hover:text-violet-500 transition-colors" style={{ fontFamily: "var(--font-space-grotesk)" }}>分类管理</h3>
                    <p className="text-sm text-muted-foreground">创建分类结构，管理二级分类</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm text-violet-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  <span>开始管理</span>
                  <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>

            <Link href="/dashboard/import-export" className="block">
              <div 
                className="action-card group cursor-pointer"
                style={{ "--accent-color": "#10b981" } as React.CSSProperties}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Zap className="h-6 w-6 text-emerald-500" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1 group-hover:text-emerald-500 transition-colors" style={{ fontFamily: "var(--font-space-grotesk)" }}>导入导出</h3>
                    <p className="text-sm text-muted-foreground">从浏览器或其他平台导入书签</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm text-emerald-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  <span>开始导入</span>
                  <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* AI Feature Banner */}
        <div className="animate-fade-in-up delay-400 relative overflow-hidden">
          <div className="relative rounded-2xl p-8 bg-gradient-to-br from-blue-600/10 via-violet-600/5 to-transparent border border-blue-500/20">
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-500/20 to-violet-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-violet-500/15 to-blue-500/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
            
            <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
                  <Sparkles className="h-7 w-7 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-1" style={{ fontFamily: "var(--font-space-grotesk)" }}>
                    AI 智能搜索
                  </h3>
                  <p className="text-muted-foreground max-w-md">
                    使用自然语言描述你的需求，AI 将智能匹配你想要的链接。无需记忆书签名称，轻松找到所需内容。
                  </p>
                </div>
              </div>
              <Link href="/">
                <Button className="bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600 text-white border-0 shadow-lg shadow-blue-500/25 px-6 py-3 font-medium">
                  <Sparkles className="w-4 h-4 mr-2" />
                  体验 AI 搜索
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
