"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { DynamicIcon } from "@/components/DynamicIcon";
import {
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  User,
} from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Button } from "@/components/ui/button";
import { LinkForm } from "@/components/LinkForm";
import { cn, proxyImageUrl } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  optimisticAddToCache,
  rollbackCache,
} from "@/lib/cache-client";
import toast from "react-hot-toast";

interface MainLayoutProps {
  children: React.ReactNode;
  categories: Array<{
    id: string;
    slug?: string | null;
    name: string;
    icon?: string | null;
    parentId?: string | null;
    isPublic?: boolean | null;
    _count?: { links: number };
    children?: Array<{
      id: string;
      slug?: string | null;
      name: string;
      icon?: string | null;
      parentId?: string | null;
      _count?: { links: number };
    }>;
  }>;
}

export function MainLayout({ children, categories }: MainLayoutProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [menuPinned, setMenuPinned] = useState(false);
  const [showAddLink, setShowAddLink] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 同步 URL 搜索参数到搜索框，确保搜索结果页不清除搜索词
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      setSearchQuery(q);
    }
  }, [searchParams]);

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

  // 键盘快捷键：按 / 聚焦搜索框
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !e.ctrlKey &&
        !e.metaKey &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA" &&
        document.activeElement?.getAttribute("contenteditable") !== "true"
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const isLoggedIn = !!session;

  const handleAddLink = async (data: {
    title: string;
    url: string;
    altUrl?: string;
    description?: string;
    categoryId: string;
    isPrivate: boolean;
  }) => {
    setIsSubmitting(true);
    setShowAddLink(false);
    // 乐观写入缓存（策略4：先更新本地缓存，页面瞬时响应）
    const { previousData, previousTotal } = optimisticAddToCache("Link", 1, data as unknown as Record<string, unknown>);

    try {
      const response = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        toast.success("链接添加成功");
      } else {
        // 回滚缓存
        rollbackCache("Link", 1, previousData, previousTotal);
        const error = await response.json();
        toast.error(error.error || "添加失败");
      }
    } catch {
      rollbackCache("Link", 1, previousData, previousTotal);
      toast.error("添加失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 transition-colors duration-500">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-2xl border-b border-slate-200/50 dark:bg-slate-800/80 dark:border-slate-700/50 transition-colors duration-300">
        <div className="w-full px-6">
          <div className="flex items-center justify-between h-16">
            {/* Left - Logo */}
            <div className="flex items-center">
              <Link href="/" className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 via-sky-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <span className="text-white font-bold text-xs" style={{ fontFamily: "var(--font-space-grotesk)" }}>ON</span>
                </div>
                <span className="font-bold text-lg text-slate-800 dark:text-white" style={{ fontFamily: "var(--font-space-grotesk)" }}>OneNav</span>
              </Link>
            </div>

            {/* Center - Search */}
            <div className="flex-1 max-w-xl px-8 hidden sm:block">
              <div className="relative">
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && searchQuery.trim()) {
                      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
                    }
                  }}
                  placeholder="搜索书签… (按 / 快速聚焦)"
                  className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-200 bg-slate-50/80 text-slate-800 dark:bg-slate-700/50 dark:border-slate-600/50 dark:text-white dark:placeholder-slate-400 focus:bg-white dark:focus:bg-slate-700/80 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
                />
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Right - Actions */}
            <div className="flex items-center gap-3">
              <ThemeSwitcher />

              {isLoggedIn ? (
                <div ref={avatarRef} className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} onClick={handleAvatarClick}>
                  <div className={cn(session?.user?.role === "admin" && "admin-avatar-ring")}>
                    <button
                      className="flex items-center justify-center w-9 h-9 rounded-full font-medium text-sm shadow-lg hover:shadow-xl transition-all overflow-hidden cursor-pointer bg-gradient-to-br from-blue-500 to-sky-500 text-white"
                      title="用户菜单"
                    >
                      {session?.user?.image ? (
                        <img src={proxyImageUrl(session.user.image)} alt="" className="w-full h-full object-cover rounded-full" />
                      ) : (
                        session?.user?.name?.[0]?.toUpperCase() || session?.user?.email?.[0]?.toUpperCase() || "U"
                      )}
                    </button>
                    {session?.user?.role === "admin" && <span className="admin-avatar-badge">管</span>}
                  </div>
                  {/* Dropdown */}
                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1 z-50">
                      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
                        <p className="text-sm font-medium text-slate-800 dark:text-white truncate">
                          {session?.user?.name || "用户"}
                        </p>
                      </div>
                      <Link
                        href="/dashboard"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                        onClick={() => { setUserMenuOpen(false); setMenuPinned(false); }}
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        管理后台
                      </Link>
                      <Link
                        href="/dashboard/account"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                        onClick={() => { setUserMenuOpen(false); setMenuPinned(false); }}
                      >
                        <User className="h-4 w-4" />
                        账户管理
                      </Link>
                      <button
                        onClick={() => { signOut(); setUserMenuOpen(false); setMenuPinned(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <LogOut className="h-4 w-4" />
                        退出登录
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Link href="/login">
                  <Button size="sm" className="bg-gradient-to-r from-blue-500 to-sky-500 hover:from-blue-600 hover:to-sky-600 shadow-lg shadow-blue-500/25 text-white">登录</Button>
                </Link>
              )}

              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1">
        {/* Sidebar - always visible on left side */}
        <aside className="w-60 flex-shrink-0 hidden lg:block bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl border-r border-slate-200/50 dark:border-slate-700/50 p-4">
          <div className="sticky top-6">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-2" style={{ fontFamily: "var(--font-space-grotesk)" }}>
              分类导航
            </h3>
            <nav className="space-y-1">
              <Link
                href="/"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  pathname === "/"
                    ? "bg-gradient-to-r from-blue-500 to-sky-500 text-white shadow-md shadow-blue-500/20"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60"
                )}
              >
                <Home className="h-4 w-4" />
                全部链接
              </Link>

              {categories.map((category) => (
                <div key={category.id}>
                  <Link
                    href={`/category/${category.slug}`}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                      pathname === `/category/${category.slug}`
                        ? "bg-gradient-to-r from-blue-500 to-sky-500 text-white shadow-md shadow-blue-500/20"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60"
                    )}
                  >
                    <DynamicIcon name={category.icon || "Folder"} className="h-4 w-4" />
                    <span className="flex-1 truncate">{category.name}</span>
                  </Link>
                  {category.children && category.children.length > 0 && (
                    <div className="ml-4 mt-1 space-y-1">
                      {category.children.map((child) => (
                        <Link
                          key={child.id}
                          href={`/category/${child.slug}`}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all duration-200",
                            pathname === `/category/${child.slug}`
                              ? "bg-gradient-to-r from-blue-500 to-sky-500 text-white shadow-md shadow-blue-500/20"
                              : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60"
                          )}
                        >
                          <DynamicIcon name={child.icon || "Folder"} className="h-3 w-3" />
                          <span className="flex-1 truncate">{child.name}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main Area */}
        <main className="flex-1 px-8 pt-8 flex flex-col">
          <div className="flex-1">{children}</div>

          <SiteFooter />
        </main>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden">
          <div className="absolute right-0 top-0 h-full w-64 bg-white dark:bg-slate-800 shadow-xl overflow-y-auto">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <span className="font-bold text-[#3498db]">菜单</span>
              <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <nav className="p-4 space-y-1">
              <Link
                href="/"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Home className="h-4 w-4" />
                全部链接
              </Link>
              {categories.map((cat) => (
                <div key={cat.id}>
                  <Link
                    href={`/category/${cat.slug}`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <DynamicIcon name={cat.icon || "Folder"} className="h-4 w-4" />
                    {cat.name}
                  </Link>
                  {cat.children?.map((child) => (
                    <Link
                      key={child.id}
                      href={`/category/${child.slug}`}
                      className="flex items-center gap-3 pl-10 pr-3 py-2 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <DynamicIcon name={child.icon || "Folder"} className="h-4 w-4" />
                      {child.name}
                    </Link>
                  ))}
                </div>
              ))}
              <hr className="my-4 border-slate-200 dark:border-slate-700" />
              <Link
                href="/dashboard"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                onClick={() => setMobileMenuOpen(false)}
              >
                <LayoutDashboard className="h-4 w-4" />
                管理后台
              </Link>
              <button
                onClick={() => { signOut(); setMobileMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Add Link Dialog */}
      <Dialog open={showAddLink} onOpenChange={setShowAddLink}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加链接</DialogTitle>
          </DialogHeader>
          <LinkForm
            categories={categories.filter((c) => !c.parentId).map((c) => ({ id: c.id, name: c.name, isPublic: c.isPublic ?? true })) as Array<{ id: string; name: string; isPublic: boolean }>}
            onSubmit={handleAddLink}
            onCancel={() => setShowAddLink(false)}
            isSubmitting={isSubmitting}
            submitLabel="添加"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
