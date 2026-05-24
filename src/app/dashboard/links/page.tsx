"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Plus, Search, Trash2, ExternalLink, RefreshCw, CheckCircle, XCircle, Link2, Globe, Lock, Pencil, ChevronDown, Check, Loader2, Home } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LinkForm } from "@/components/LinkForm";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { DynamicIcon } from "@/components/DynamicIcon";
import type { Link as LinkType, Category } from "@/types";

function highlightText(text: string, query: string) {
  if (!query.trim()) return text;
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${esc})`, "gi");
  return text.split(regex).map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-yellow-200 dark:bg-yellow-500/30 rounded px-0.5">{part}</mark>
    ) : (
      part
    )
  );
}

export default function LinksPage() {
  const [links, setLinks] = useState<LinkType[]>(() => {
    try {
      const cached = localStorage.getItem("nav_links_cache");
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [categories, setCategories] = useState<Category[]>(() => {
    try {
      const cached = localStorage.getItem("nav_categories_cache");
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);

  const [newLink, setNewLink] = useState({
    title: "",
    url: "",
    altUrl: "",
    description: "",
    favicon: "",
    categoryId: "",
    isPrivate: false,
    isPinned: false,
  });
  const [isChecking, setIsChecking] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [checkResults, setCheckResults] = useState<Record<string, string>>({});
  const [singleChecking, setSingleChecking] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [accessFilter, setAccessFilter] = useState("all");
  const [connectivityFilter, setConnectivityFilter] = useState("all");

  // 访问权限下拉菜单
  const [accessMenuOpen, setAccessMenuOpen] = useState(false);
  const accessBtnRef = useRef<HTMLButtonElement>(null);
  const accessMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!accessMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (accessMenuRef.current && !accessMenuRef.current.contains(e.target as Node)) {
        setAccessMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [accessMenuOpen]);

  // 分类筛选下拉菜单
  const [catMenuOpen, setCatMenuOpen] = useState(false);
  const catBtnRef = useRef<HTMLButtonElement>(null);
  const catMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!catMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (catMenuRef.current && !catMenuRef.current.contains(e.target as Node)) {
        setCatMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [catMenuOpen]);

  // 连通性筛选下拉菜单
  const [connMenuOpen, setConnMenuOpen] = useState(false);
  const connBtnRef = useRef<HTMLButtonElement>(null);
  const connMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!connMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (connMenuRef.current && !connMenuRef.current.contains(e.target as Node)) {
        setConnMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [connMenuOpen]);

  // 逐行访问权限下拉
  const [linkAccessId, setLinkAccessId] = useState<string | null>(null);
  const [linkAccessPos, setLinkAccessPos] = useState<{ top: number; left: number } | null>(null);
  const linkAccessMenuRef = useRef<HTMLDivElement>(null);
  const [linkUpdating, setLinkUpdating] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!linkAccessId) return;
    const handler = (e: MouseEvent) => {
      if (linkAccessMenuRef.current && !linkAccessMenuRef.current.contains(e.target as Node)) {
        setLinkAccessId(null);
        setLinkAccessPos(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [linkAccessId]);

  const handleToggleAccess = async (linkId: string, currentPrivate: boolean) => {
    setLinkAccessId(null);
    setLinkAccessPos(null);
    setLinkUpdating((prev) => ({ ...prev, [linkId]: true }));
    try {
      const res = await fetch(`/api/links/${linkId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrivate: !currentPrivate }),
      });
      if (res.ok) {
        const updated = await res.json();
        setLinks((prev) =>
          prev.map((l) => (l.id === linkId ? { ...l, isPrivate: updated.isPrivate } : l))
        );
        toast.success(updated.isPrivate ? "已设为私有" : "已设为公开");
      } else {
        const err = await res.json();
        toast.error(err.error || "操作失败");
      }
    } catch {
      toast.error("操作失败");
    } finally {
      setLinkUpdating((prev) => ({ ...prev, [linkId]: false }));
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const [linksRes, categoriesRes] = await Promise.all([
        fetch("/api/links?includePrivate=true"),
        fetch("/api/categories"),
      ]);

      if (linksRes.ok && categoriesRes.ok) {
        const linksData = await linksRes.json();
        const categoriesData = await categoriesRes.json();
        setLinks(linksData);
        setCategories(categoriesData);
        try {
          localStorage.setItem("nav_links_cache", JSON.stringify(linksData));
          localStorage.setItem("nav_categories_cache", JSON.stringify(categoriesData));
        } catch { /* ignore */ }
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // links / categories 状态变化时同步到 localStorage（覆盖 CRUD 操作）
  useEffect(() => {
    if (links.length > 0) {
      try { localStorage.setItem("nav_links_cache", JSON.stringify(links)); } catch { /* ignore */ }
    }
  }, [links]);

  useEffect(() => {
    if (categories.length > 0) {
      try { localStorage.setItem("nav_categories_cache", JSON.stringify(categories)); } catch { /* ignore */ }
    }
  }, [categories]);

  // 从 localStorage 恢复连通性检测结果
  useEffect(() => {
    try {
      const saved = localStorage.getItem("nav_check_results");
      if (saved) {
        setCheckResults(JSON.parse(saved));
      }
    } catch {
      // ignore
    }
  }, []);

  // 连通性检测结果变化时持久化到 localStorage
  useEffect(() => {
    if (Object.keys(checkResults).length > 0) {
      localStorage.setItem("nav_check_results", JSON.stringify(checkResults));
    }
  }, [checkResults]);

  const handleCreateLink = async (data: {
    title: string;
    url: string;
    altUrl?: string;
    description?: string;
    favicon?: string;
    categoryId: string;
    isPrivate: boolean;
    isPinned?: boolean;
  }) => {
    setIsSubmitting(true);
    try {
      const linkUrl = editingLinkId ? `/api/links/${editingLinkId}` : "/api/links";
      const method = editingLinkId ? "PUT" : "POST";

      const response = await fetch(linkUrl, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const savedLink = await response.json();
        toast.success(editingLinkId ? "链接更新成功" : "链接创建成功");
        setIsDialogOpen(false);
        setEditingLinkId(null);
        setNewLink({
          title: "",
          url: "",
          altUrl: "",
          description: "",
          favicon: "",
          categoryId: "",
          isPrivate: false,
          isPinned: false,
        });
        fetchData();
        // 创建/更新后自动检测连通性
        handleCheckSingle(savedLink.id, savedLink.url);
      } else {
        const error = await response.json();
        toast.error(error.error || "操作失败");
      }
    } catch {
      toast.error("操作失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteLink = async (id: string) => {
    if (!confirm("确定要删除这个链接吗？")) return;

    try {
      const response = await fetch(`/api/links/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("链接已删除");
        fetchData();
      } else {
        toast.error("删除失败");
      }
    } catch {
      toast.error("删除失败");
    }
  };

  const handleEditLink = (link: LinkType) => {
    setEditingLinkId(link.id);
    setNewLink({
      title: link.title,
      url: link.url,
      altUrl: link.altUrl || "",
      description: link.description || "",
      favicon: link.favicon || "",
      categoryId: link.categoryId,
      isPrivate: link.isPrivate,
      isPinned: link.isPinned,
    });
    setIsDialogOpen(true);
  };

  const handleCheckLinks = async () => {
    setIsChecking(true);
    toast.success(`开始检测 ${links.length} 个链接...`);

    const resultsMap: Record<string, string> = {};
    let activeCount = 0;
    let timeoutCount = 0;
    let deadCount = 0;

    // 浏览器直连检测，并发 8 个
    const chunks = [];
    for (let i = 0; i < links.length; i += 8) {
      chunks.push(links.slice(i, i + 8));
    }

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (link) => {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 10000);

            // 浏览器直连，no-cors 模式下能检测服务器是否可达
            await fetch(link.url, {
              mode: "no-cors",
              signal: controller.signal,
            });

            clearTimeout(timer);
            resultsMap[link.id] = "active";
            activeCount++;
          } catch (err: unknown) {
            if (err instanceof DOMException && err.name === "AbortError") {
              resultsMap[link.id] = "timeout";
              timeoutCount++;
            } else {
              resultsMap[link.id] = "dead";
              deadCount++;
            }
          }
        })
      );
    }

    setCheckResults(resultsMap);
    toast.success(`检测完成：${activeCount} 个有效，${timeoutCount} 个超时，${deadCount} 个不可达`);
    setIsChecking(false);
  };

  const handleCheckSingle = async (linkId: string, url: string) => {
    if (singleChecking.has(linkId)) return;

    setSingleChecking((prev) => new Set(prev).add(linkId));
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);

      await fetch(url, {
        mode: "no-cors",
        signal: controller.signal,
      });

      clearTimeout(timer);
      setCheckResults((prev) => ({ ...prev, [linkId]: "active" }));
    } catch (err: unknown) {
      const status =
        err instanceof DOMException && err.name === "AbortError"
          ? "timeout"
          : "dead";
      setCheckResults((prev) => ({ ...prev, [linkId]: status }));
    } finally {
      setSingleChecking((prev) => {
        const next = new Set(prev);
        next.delete(linkId);
        return next;
      });
    }
  };

  const handleRecognize = async () => {
    if (!newLink.url) {
      toast.error("请先输入URL");
      return;
    }

    setIsRecognizing(true);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const response = await fetch("/api/links/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newLink.url }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.ok) {
        const data = await response.json();
        setNewLink((prev) => ({
          ...prev,
          title: data.title || prev.title,
          description: data.description || prev.description,
          favicon: data.favicon || prev.favicon,
        }));
        toast.success("信息识别成功");
      } else {
        const error = await response.json();
        toast.error(error.error || "识别失败");
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.error("识别超时");
      } else {
        toast.error("识别失败");
      }
    } finally {
      setIsRecognizing(false);
    }
  };

  const filteredLinks = links.filter((link) => {
    // 搜索
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      link.title.toLowerCase().includes(q) ||
      link.url.toLowerCase().includes(q) ||
      link.description?.toLowerCase().includes(q);

    // 分类筛选
    const matchesCategory =
      categoryFilter === "all" || link.categoryId === categoryFilter;

    // 访问权限筛选
    const matchesAccess =
      accessFilter === "all" ||
      (accessFilter === "private" && link.isPrivate) ||
      (accessFilter === "public" && !link.isPrivate);

    // 连通性筛选
    const matchesConnectivity =
      connectivityFilter === "all" ||
      checkResults[link.id] === connectivityFilter;

    return matchesSearch && matchesCategory && matchesAccess && matchesConnectivity;
  });

  const stats = {
    totalLinks: links.length,
    totalCategories: categories.length,
    publicLinks: links.filter((l) => !l.isPrivate).length,
    privateLinks: links.filter((l) => l.isPrivate).length,
  };

  return (
    <AdminLayout stats={stats}>
      <div className="dashboard-container space-y-8">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-space-grotesk)" }}>链接管理</h1>
            <p className="text-muted-foreground">
              共 {links.length} 个链接
            </p>
          </div>

          {/* Stats Cards */}
          <div className="hidden md:flex items-center gap-3 animate-fade-in-up delay-200">
            <div className="glass-effect rounded-full px-4 py-2 flex items-center gap-2">
              <Link2 className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">{stats.totalLinks} 个链接</span>
            </div>
            <div className="glass-effect rounded-full px-4 py-2 flex items-center gap-2">
              <Globe className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-medium">{stats.publicLinks} 公开</span>
            </div>
            <div className="glass-effect rounded-full px-4 py-2 flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium">{stats.privateLinks} 私有</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleCheckLinks}
              disabled={isChecking || links.length === 0}
            >
              {isChecking ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  检测中...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  检测链接
                </>
              )}
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  添加链接
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingLinkId ? "编辑链接" : "添加新链接"}</DialogTitle>
                </DialogHeader>
                <LinkForm
                  key={editingLinkId || "new"}
                  initialData={newLink}
                  categories={categories}
                  onSubmit={handleCreateLink}
                  onCancel={() => {
                    setIsDialogOpen(false);
                    setEditingLinkId(null);
                    setNewLink({
                      title: "",
                      url: "",
                      altUrl: "",
                      description: "",
                      favicon: "",
                      categoryId: "",
                      isPrivate: false,
                      isPinned: false,
                    });
                  }}
                  isSubmitting={isSubmitting}
                  submitLabel={editingLinkId ? "更新" : "添加"}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索链接..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          {/* Category Filter — 同款自定义下拉 */}
          <div className="relative">
            <button
              ref={catBtnRef}
              onClick={() => setCatMenuOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-700 transition-all cursor-pointer h-9"
            >
              {categoryFilter === "all" ? (
                <Home className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
              ) : (
                <DynamicIcon name={categories.find((c) => c.id === categoryFilter)?.icon || "Folder"} className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
              )}
              {categoryFilter === "all" ? "全部分类" : (categories.find((c) => c.id === categoryFilter)?.name || "分类")}
              <ChevronDown className="h-3 w-3 opacity-50" />
            </button>
            {catMenuOpen && createPortal(
              <div
                ref={catMenuRef}
                style={{
                  position: "fixed",
                  top: (catBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                  left: (catBtnRef.current?.getBoundingClientRect().left ?? 0) + (catBtnRef.current?.getBoundingClientRect().width ?? 0) / 2,
                  transform: "translateX(-50%)",
                }}
                className="z-[9999] min-w-[140px] max-h-[240px] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1"
              >
                <button
                  onClick={() => { setCategoryFilter("all"); setCatMenuOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-700",
                    categoryFilter === "all" ? "text-slate-900 dark:text-white font-medium" : "text-slate-600 dark:text-slate-400"
                  )}
                >
                  <Home className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
                  <span className="flex-1 text-left">全部分类</span>
                  {categoryFilter === "all" && <Check className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />}
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setCategoryFilter(c.id); setCatMenuOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-700",
                      categoryFilter === c.id ? "text-slate-900 dark:text-white font-medium" : "text-slate-600 dark:text-slate-400"
                    )}
                  >
                    <DynamicIcon name={c.icon || "Folder"} className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
                    <span className="flex-1 text-left">{c.name}</span>
                    {categoryFilter === c.id && <Check className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />}
                  </button>
                ))}
              </div>,
              document.body
            )}
          </div>
          {/* Access Filter — 同款自定义下拉 */}
          <div className="relative">
            <button
              ref={accessBtnRef}
              onClick={() => setAccessMenuOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-700 transition-all cursor-pointer h-9"
            >
              {accessFilter === "all" ? (
                <Globe className="h-3.5 w-3.5 text-slate-400" />
              ) : accessFilter === "public" ? (
                <Globe className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Lock className="h-3.5 w-3.5 text-amber-500" />
              )}
              {accessFilter === "all" ? "全部" : accessFilter === "public" ? "公开" : "私有"}
              <ChevronDown className="h-3 w-3 opacity-50" />
            </button>
            {accessMenuOpen && createPortal(
              <div
                ref={accessMenuRef}
                style={{
                  position: "fixed",
                  top: (accessBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                  left: (accessBtnRef.current?.getBoundingClientRect().left ?? 0) + (accessBtnRef.current?.getBoundingClientRect().width ?? 0) / 2,
                  transform: "translateX(-50%)",
                }}
                className="z-[9999] min-w-[120px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1"
              >
                {([
                  { value: "all", label: "全部", Icon: Globe, color: "text-slate-400" },
                  { value: "public", label: "公开", Icon: Globe, color: "text-emerald-500" },
                  { value: "private", label: "私有", Icon: Lock, color: "text-amber-500" },
                ] as const).map(({ value, label, Icon, color }) => (
                  <button
                    key={value}
                    onClick={() => {
                      setAccessFilter(value);
                      setAccessMenuOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-700",
                      accessFilter === value
                        ? "text-slate-900 dark:text-white font-medium"
                        : "text-slate-600 dark:text-slate-400"
                    )}
                  >
                    <Icon className={cn("h-3.5 w-3.5", color)} />
                    <span className="flex-1 text-left">{label}</span>
                    {accessFilter === value && (
                      <Check className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>,
              document.body
            )}
          </div>
          {/* Connectivity Filter — 同款自定义下拉 */}
          <div className="relative">
            <button
              ref={connBtnRef}
              onClick={() => setConnMenuOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-700 transition-all cursor-pointer h-9"
            >
              {connectivityFilter === "active" ? (
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
              ) : connectivityFilter === "timeout" ? (
                <XCircle className="h-3.5 w-3.5 text-amber-500" />
              ) : connectivityFilter === "dead" ? (
                <XCircle className="h-3.5 w-3.5 text-red-500" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
              )}
              {connectivityFilter === "active" ? "有效" : connectivityFilter === "timeout" ? "超时" : connectivityFilter === "dead" ? "不可达" : "连通性"}
              <ChevronDown className="h-3 w-3 opacity-50" />
            </button>
            {connMenuOpen && createPortal(
              <div
                ref={connMenuRef}
                style={{
                  position: "fixed",
                  top: (connBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                  left: (connBtnRef.current?.getBoundingClientRect().left ?? 0) + (connBtnRef.current?.getBoundingClientRect().width ?? 0) / 2,
                  transform: "translateX(-50%)",
                }}
                className="z-[9999] min-w-[120px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1"
              >
                {([
                  { value: "all", label: "全部", Icon: RefreshCw, color: "text-slate-400" },
                  { value: "active", label: "有效", Icon: CheckCircle, color: "text-emerald-500" },
                  { value: "timeout", label: "超时", Icon: XCircle, color: "text-amber-500" },
                  { value: "dead", label: "不可达", Icon: XCircle, color: "text-red-500" },
                ] as const).map(({ value, label, Icon, color }) => (
                  <button
                    key={value}
                    onClick={() => { setConnectivityFilter(value); setConnMenuOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-700",
                      connectivityFilter === value ? "text-slate-900 dark:text-white font-medium" : "text-slate-600 dark:text-slate-400"
                    )}
                  >
                    <Icon className={cn("h-3.5 w-3.5", color)} />
                    <span className="flex-1 text-left">{label}</span>
                    {connectivityFilter === value && <Check className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />}
                  </button>
                ))}
              </div>,
              document.body
            )}
          </div>
        </div>

        {/* Links Table */}
        <div className="animate-fade-in-up delay-300">
        <div className="action-card" style={{ "--accent-color": "#3b82f6" } as React.CSSProperties}>
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Link2 className="h-6 w-6 text-blue-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1" style={{ fontFamily: "var(--font-space-grotesk)" }}>链接列表</h3>
              <p className="text-sm text-muted-foreground">
                管理你的所有链接
              </p>
            </div>
          </div>

          <div className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">标题</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>分类</TableHead>
                  <TableHead>访问权限</TableHead>
                  <TableHead>连通性</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLinks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      没有找到链接
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLinks.map((link) => (
                    <TableRow key={link.id}>
                      <TableCell className="font-medium">
                        {link.isPinned && (
                          <span className="text-primary mr-1" title="已置顶">
                            📌
                          </span>
                        )}
                        {highlightText(link.title, searchQuery)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary"
                        >
                          {highlightText(link.url, searchQuery)}
                        </a>
                      </TableCell>
                      <TableCell className={link.category?.name ? undefined : "text-muted-foreground"}>
                        {link.category?.name || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="relative inline-block">
                          <button
                            onClick={(e) => {
                              if (linkAccessId === link.id) {
                                setLinkAccessId(null);
                                setLinkAccessPos(null);
                              } else {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setLinkAccessPos({ top: rect.bottom + 4, left: rect.left + rect.width / 2 });
                                setLinkAccessId(link.id);
                              }
                            }}
                            disabled={linkUpdating[link.id]}
                            className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ring-1",
                              link.isPrivate
                                ? "bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20 dark:hover:bg-amber-500/20"
                                : "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20 dark:hover:bg-emerald-500/20"
                            )}
                          >
                            {linkUpdating[link.id] ? (
                              <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                            ) : link.isPrivate ? (
                              <Lock className="h-3 w-3 text-amber-500" />
                            ) : (
                              <Globe className="h-3 w-3 text-emerald-500" />
                            )}
                            {link.isPrivate ? "私有" : "公开"}
                            <ChevronDown className="h-3 w-3 opacity-50" />
                          </button>
                          {linkAccessId === link.id && linkAccessPos && createPortal(
                            <div
                              ref={linkAccessMenuRef}
                              style={{
                                position: "fixed",
                                top: linkAccessPos.top,
                                left: linkAccessPos.left,
                                transform: "translateX(-50%)",
                              }}
                              className="z-[9999] min-w-[120px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1"
                            >
                              {([
                                { value: false, label: "公开", Icon: Globe, color: "text-emerald-500" },
                                { value: true, label: "私有", Icon: Lock, color: "text-amber-500" },
                              ] as const).map(({ value, label, Icon, color }) => (
                                <button
                                  key={String(value)}
                                  onClick={() => handleToggleAccess(link.id, link.isPrivate)}
                                  disabled={linkUpdating[link.id]}
                                  className={cn(
                                    "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-700",
                                    link.isPrivate === value ? "text-slate-900 dark:text-white font-medium" : "text-slate-600 dark:text-slate-400"
                                  )}
                                >
                                  <Icon className={cn("h-3.5 w-3.5", color)} />
                                  <span className="flex-1 text-left">{label}</span>
                                  {link.isPrivate === value && <Check className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />}
                                </button>
                              ))}
                            </div>,
                            document.body
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const checking = singleChecking.has(link.id);
                          const s = checkResults[link.id];

                          if (checking) {
                            return (
                              <span className="text-xs font-medium px-2 py-0.5 rounded inline-flex items-center gap-1 bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                                <RefreshCw className="h-3 w-3" /> 检测中
                              </span>
                            );
                          }

                          if (!s) {
                            return (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCheckSingle(link.id, link.url);
                                }}
                                className="text-xs font-medium px-2 py-0.5 rounded inline-flex items-center gap-1 text-slate-400 dark:text-slate-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/20 transition-colors cursor-pointer"
                              >
                                <RefreshCw className="h-3 w-3" /> 检测
                              </button>
                            );
                          }

                          const badge =
                            s === "active" ? (
                              <span className="text-xs font-medium px-2 py-0.5 rounded inline-flex items-center gap-1 bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300">
                                <CheckCircle className="h-3 w-3" /> 有效
                              </span>
                            ) : s === "timeout" ? (
                              <span className="text-xs font-medium px-2 py-0.5 rounded inline-flex items-center gap-1 bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                                <XCircle className="h-3 w-3" /> 超时
                              </span>
                            ) : (
                              <span className="text-xs font-medium px-2 py-0.5 rounded inline-flex items-center gap-1 bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300">
                                <XCircle className="h-3 w-3" /> 不可达
                              </span>
                            );

                          return (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCheckSingle(link.id, link.url);
                              }}
                              className="cursor-pointer hover:opacity-80"
                              title="重新检测"
                            >
                              {badge}
                            </button>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditLink(link)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button variant="ghost" size="icon">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </a>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteLink(link.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        </div>
      </div>
    </AdminLayout>
  );
}
