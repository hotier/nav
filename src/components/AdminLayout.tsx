"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { redirect } from "next/navigation";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeft,
  Link2,
  FolderOpen,
  Settings2,
  LogOut,
  FileUp,
  ChevronRight,
  Menu,
  X,
  User,
  Users,
} from "lucide-react";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { cn, proxyImageUrl } from "@/lib/utils";
import { SiteFooter } from "@/components/SiteFooter";
import { useState } from "react";

interface AdminLayoutProps {
  children: React.ReactNode;
  stats?: {
    totalLinks: number;
    totalCategories: number;
    publicLinks: number;
    privateLinks: number;
  };
}

const navItems = [
  { href: "/dashboard", label: "仪表盘", icon: LayoutDashboard, badge: "新" },
  { href: "/dashboard/links", label: "链接管理", icon: Link2 },
  { href: "/dashboard/categories", label: "分类管理", icon: FolderOpen },
  { href: "/dashboard/users", label: "用户管理", icon: Users, adminOnly: true },
  { href: "/dashboard/import-export", label: "导入导出", icon: FileUp },
  { href: "/dashboard/account", label: "账户管理", icon: User },
  { href: "/dashboard/settings", label: "设置", icon: Settings2 },
];

export function AdminLayout({ children }: AdminLayoutProps) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  if (status === "loading") {
    return null;
  }

  if (!session) {
    redirect("/login");
  }

  const sidebarContent = (
    <div className="h-full p-4 relative">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 left-0 w-full h-40 rounded-b-3xl opacity-30 bg-gradient-to-b from-blue-100 to-transparent dark:from-blue-500/15 dark:to-transparent" />
      <div className="absolute bottom-0 left-0 w-full h-40 rounded-t-3xl opacity-30 bg-gradient-to-t from-cyan-100 to-transparent dark:from-cyan-500/15 dark:to-transparent" />

      {/* Navigation */}
      <nav className="relative space-y-1 mt-4">
        {navItems.map((item) => {
          // 仅管理员可见的菜单项
          if ((item as Record<string, unknown>).adminOnly && session?.user?.role !== "admin") {
            return null;
          }
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-300 relative",
                isActive
                  ? "bg-gradient-to-r from-blue-100 to-cyan-100 text-slate-700 shadow-sm dark:from-blue-500/15 dark:to-cyan-500/15 dark:text-white"
                  : "text-slate-600 hover:text-slate-800 hover:bg-blue-50 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-700/40"
              )}
            >
              <div className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300",
                isActive
                  ? "bg-blue-200/50 dark:bg-white/15"
                  : "group-hover:bg-blue-100 dark:group-hover:bg-slate-600/40"
              )}>
                <Icon className={cn(
                  "h-5 w-5 transition-transform duration-300",
                  isActive ? "text-blue-500" : "group-hover:text-blue-500 dark:group-hover:text-blue-400 group-hover:scale-110"
                )} />
              </div>
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300">
                  {item.badge}
                </span>
              )}
              <ChevronRight className={cn(
                "h-4 w-4 transition-all duration-300",
                isActive ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 group-hover:opacity-50 group-hover:translate-x-0"
              )} />
            </Link>
          );
        })}
      </nav>

    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 transition-colors duration-500">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-700/50 transition-all duration-300">
        <div className="flex h-16 items-center justify-between px-6">
          {/* Left Section */}
          <div className="flex items-center gap-4">
            {/* Mobile hamburger */}
            <button
              className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100/80 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Back Button */}
            <Link
              href="/"
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100/80 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/20 transition-all duration-200"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>

            {/* Logo */}
            <div className="flex items-center gap-2.5 text-slate-800 dark:text-white">
              <div className="relative">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 via-sky-500 to-cyan-500 flex items-center justify-center">
                  <span className="text-white font-bold text-xs" style={{ fontFamily: "var(--font-space-grotesk)" }}>ON</span>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm leading-none" style={{ fontFamily: "var(--font-space-grotesk)" }}>OneNav</span>
                <span className="text-[10px] leading-none mt-0.5 text-slate-400 dark:text-slate-500">书签管理</span>
              </div>
            </div>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-3">
            <ThemeSwitcher />

            {/* User Avatar with Dropdown */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-sky-500 text-white font-medium text-sm shadow-lg hover:shadow-xl transition-all overflow-hidden"
                title="用户菜单"
              >
                {session.user?.image ? (
                  <img src={proxyImageUrl(session.user.image)} alt="" className="w-full h-full object-cover" />
                ) : (
                  session.user?.name?.[0]?.toUpperCase() || session.user?.email?.[0]?.toUpperCase() || "U"
                )}
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1 z-50">
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
                    <p className="text-sm font-medium text-slate-800 dark:text-white truncate">
                      {session.user?.name || "用户"}
                    </p>
                  </div>
                  <Link
                    href="/"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    回到首页
                  </Link>
                  <Link
                    href="/dashboard/account"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <User className="h-4 w-4" />
                    账户管理
                  </Link>
                  <button
                    onClick={() => { signOut(); setUserMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <LogOut className="h-4 w-4" />
                    退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-60 flex-shrink-0 h-[calc(100vh-4rem)] sticky top-16 overflow-y-auto bg-white/60 dark:bg-slate-800/60 transition-colors duration-500">
          {sidebarContent}
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 pt-4 lg:pt-6 px-4 lg:px-6 flex flex-col">
          <div className="flex-1 rounded-2xl p-4 lg:p-6 bg-white/90 dark:bg-slate-800/50 shadow-sm transition-colors duration-500">
            {children}
          </div>

          <SiteFooter />
        </main>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-white dark:bg-slate-800 shadow-xl animate-in slide-in-from-left">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <span className="font-bold text-blue-500" style={{ fontFamily: "var(--font-space-grotesk)" }}>管理菜单</span>
              <button
                className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            {sidebarContent}
          </div>
        </div>
      )}
    </div>
  );
}
