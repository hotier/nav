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
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn, proxyImageUrl } from "@/lib/utils";
import { SiteFooter } from "@/components/SiteFooter";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { useState, useEffect, useRef } from "react";

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
  const avatarUrl = useUserAvatar();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [menuPinned, setMenuPinned] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
        setMenuPinned(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    setUserMenuOpen(true);
  };

  const handleMouseLeave = () => {
    if (menuPinned) return;
    leaveTimerRef.current = setTimeout(() => setUserMenuOpen(false), 300);
  };

  const handleAvatarClick = () => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    if (userMenuOpen && menuPinned) {
      setUserMenuOpen(false);
      setMenuPinned(false);
    } else {
      setUserMenuOpen(true);
      setMenuPinned(true);
    }
  };

  if (status === "loading") {
    return null;
  }

  if (!session) {
    redirect("/login");
  }

  const sidebarContent = (
    <div className="h-full p-4 relative">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 left-0 w-full h-40 rounded-b-3xl opacity-30 bg-gradient-to-b from-primary/15 to-transparent dark:from-primary/15 dark:to-transparent" />
      <div className="absolute bottom-0 left-0 w-full h-40 rounded-t-3xl opacity-30 bg-gradient-to-t from-cyan-500/15 to-transparent dark:from-cyan-500/15 dark:to-transparent" />

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
                  ? "bg-gradient-to-r from-primary/10 to-cyan-500/10 text-primary shadow-sm dark:from-primary/15 dark:to-cyan-500/15 dark:text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-primary/10 dark:text-muted-foreground dark:hover:text-foreground dark:hover:bg-muted"
              )}
            >
              <div className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300",
                isActive
                  ? "bg-primary/15 dark:bg-white/15"
                  : "group-hover:bg-primary/10 dark:group-hover:bg-muted"
              )}>
                <Icon className={cn(
                  "h-5 w-5 transition-transform duration-300",
                  isActive ? "text-primary" : "group-hover:text-primary dark:group-hover:text-primary group-hover:scale-110"
                )} />
              </div>
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary">
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
    <div className="min-h-screen bg-gradient-to-br from-muted/40 via-background to-primary/5 dark:from-background dark:via-background dark:to-background transition-colors duration-500">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full bg-background/80 dark:bg-background/80 backdrop-blur-xl border-b border-border transition-all duration-300">
        <div className="flex h-16 items-center justify-between px-6">
          {/* Left Section */}
          <div className="flex items-center gap-4">
            {/* Mobile hamburger */}
            <button
              className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg bg-muted/80 dark:bg-muted/60 text-muted-foreground hover:text-primary dark:hover:text-primary transition-colors"
              onClick={() => setMobileMenuOpen(true)}
              title="打开菜单"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Back Button */}
            <Link
              href="/"
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted/80 dark:bg-muted/60 text-muted-foreground hover:text-primary dark:hover:text-primary hover:bg-primary/10 dark:hover:bg-primary/20 transition-all duration-200"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>

            {/* Logo */}
            <div className="flex items-center gap-2.5 text-foreground">
              <div className="relative">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary via-sky-500 to-cyan-500 flex items-center justify-center">
                  <span className="text-white font-bold text-xs" style={{ fontFamily: "var(--font-space-grotesk)" }}>ON</span>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm leading-none" style={{ fontFamily: "var(--font-space-grotesk)" }}>OneNav</span>
                <span className="text-[10px] leading-none mt-0.5 text-muted-foreground">书签管理</span>
              </div>
            </div>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-3">
            <ThemeSwitcher />

            {/* User Avatar with Dropdown */}
            <div ref={avatarRef} className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} onClick={handleAvatarClick}>
              <div className={cn(session.user?.role === "admin" ? "admin-avatar-ring" : "user-avatar-ring")}>
                <button
                  type="button"
                  className="flex items-center justify-center w-9 h-9 rounded-full overflow-hidden cursor-pointer shadow-lg hover:shadow-xl transition-all focus-visible:outline-none"
                  title="用户菜单"
                >
                  <Avatar className="h-full w-full">
                    {avatarUrl ? (
                      <AvatarImage src={proxyImageUrl(avatarUrl, 128)} alt="" className="object-cover" />
                    ) : (
                      <AvatarFallback className="bg-gradient-to-br from-primary to-sky-500 text-white font-medium text-sm">
                        {session.user?.name?.[0]?.toUpperCase() || session.user?.email?.[0]?.toUpperCase() || "U"}
                      </AvatarFallback>
                    )}
                  </Avatar>
                </button>
                {session.user?.role === "admin" ? (
                  <span className="admin-avatar-badge">管</span>
                ) : (
                  <span className="user-avatar-badge">普</span>
                )}
              </div>
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-32 bg-card dark:bg-card rounded-xl shadow-xl border border-border py-1 z-50">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-sm font-medium text-foreground truncate">
                      {session.user?.name || "用户"}
                    </p>
                  </div>
                  <Link
                    href="/"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
                    onClick={() => { setUserMenuOpen(false); setMenuPinned(false); }}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    回到首页
                  </Link>
                  <Link
                    href="/dashboard/account"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
                    onClick={() => { setUserMenuOpen(false); setMenuPinned(false); }}
                  >
                    <User className="h-4 w-4" />
                    账户管理
                  </Link>
                  <button
                    onClick={() => { signOut(); setUserMenuOpen(false); setMenuPinned(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger/10"
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
        <aside className="hidden lg:block w-60 flex-shrink-0 h-[calc(100vh-4rem)] sticky top-16 overflow-y-auto bg-card/60 dark:bg-card/60 transition-colors duration-500">
          {sidebarContent}
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 pt-4 lg:pt-6 px-4 lg:px-6 flex flex-col">
          <div className="flex-1 rounded-2xl p-4 lg:p-6 bg-card/90 dark:bg-card/50 shadow-sm transition-colors duration-500">
            {children}
          </div>

          <SiteFooter />
        </main>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-card dark:bg-card shadow-xl animate-in slide-in-from-left">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <span className="font-bold text-primary" style={{ fontFamily: "var(--font-space-grotesk)" }}>管理菜单</span>
              <button
                className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted dark:hover:bg-muted"
                onClick={() => setMobileMenuOpen(false)}
                title="关闭菜单"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            {sidebarContent}
          </div>
        </div>
      )}
    </div>
  );
}
