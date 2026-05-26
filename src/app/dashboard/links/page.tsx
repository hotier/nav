"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { Plus, Search, Trash2, RefreshCw, CheckCircle, XCircle, Link2, Globe, Lock, Edit, ChevronDown, Check, Loader2, Home, AlertTriangle, CheckSquare, MoveRight, Folders, X, User } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LinkForm } from "@/components/LinkForm";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { DynamicIcon } from "@/components/DynamicIcon";
import type { Link as LinkType, Category } from "@/types";
import {
  readPageCache,
  writePageCache,
} from "@/lib/cache-client";
import { useDataCache } from "@/hooks/useDataCache";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";

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
  const { data: session } = useSession();
  const uid = session?.user?.id;

  // Category 数据
  const { data: catData } = useDataCache({
    configs: [
    {
      name: "Category:mgmt:v2",
      fetch: () =>
        fetch("/api/categories?scope=manage&forSelector=true")
          .then((r) => r.json())
          .then((d: Category[]) => ({ data: d, total: d.length })),
    },
  ], userId: uid });

  // Link 数据 — 无限滚动加载
  const {
    items: links,
    total,
    hasMore,
    isLoadingMore,
    loading: linksLoading,
    sentinelRef,
    setItems: setData,
  } = useInfiniteScroll<LinkType>({
    name: "Link:mgmt:v2",
    autoPageSize: true,
    userId: uid,
    fetchFn: (page, pageSize) =>
      fetch(`/api/links?includePrivate=true&page=${page}&pageSize=${pageSize}&scope=manage`)
        .then((r) => r.json())
        .then((d: { data: LinkType[]; total: number }) => ({ data: d.data, total: d.total })),
  });

  const categories = (catData["Category:mgmt:v2"] || []) as Category[];

  // 从链接中提取去重创建人列表
  const uniqueCreators = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    links.forEach((link) => {
      const u = link.user;
      if (u && !seen.has(u.id)) {
        seen.set(u.id, { id: u.id, name: u.name || u.username || "未知" });
      }
    });
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name, "zh"));
  }, [links]);

  // 根据最长分类名称 + 标签计算下拉菜单宽度
  // 名称 ~16px/中文字 + 标签 ~40px + icon + gap + check + padding ≈ 120
  const categoryDropdownMinW = useMemo(() => {
    const maxLen = categories.reduce((m, c) => Math.max(m, c.name.length), 0);
    return Math.max(180, maxLen * 16 + 120);
  }, [categories]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);


  // 批量勾选
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);

  // 批量操作弹窗
  const [batchDialog, setBatchDialog] = useState<{ type: "delete" | "move" } | null>(null);
  const [batchDialogMoveTargetId, setBatchDialogMoveTargetId] = useState("");
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [isBatchMoving, setIsBatchMoving] = useState(false);

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
  const [creatorFilter, setCreatorFilter] = useState("all");

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

  // 创建人筛选下拉菜单
  const [creatorMenuOpen, setCreatorMenuOpen] = useState(false);
  const creatorBtnRef = useRef<HTMLButtonElement>(null);
  const creatorMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!creatorMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (creatorMenuRef.current && !creatorMenuRef.current.contains(e.target as Node)) {
        setCreatorMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [creatorMenuOpen]);

  // 逐行访问权限下拉
  const [linkAccessId, setLinkAccessId] = useState<string | null>(null);
  const linkAccessMenuRef = useRef<HTMLDivElement>(null);
  const [linkUpdating, setLinkUpdating] = useState<Record<string, boolean>>({});
  const [categoryUpdating, setCategoryUpdating] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!linkAccessId) return;
    const handler = (e: MouseEvent) => {
      if (linkAccessMenuRef.current && !linkAccessMenuRef.current.contains(e.target as Node)) {
        setLinkAccessId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [linkAccessId]);

  // 逐行分类下拉
  const [linkCategoryId, setLinkCategoryId] = useState<string | null>(null);
  const linkCategoryMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!linkCategoryId) return;
    const handler = (e: MouseEvent) => {
      if (linkCategoryMenuRef.current && !linkCategoryMenuRef.current.contains(e.target as Node)) {
        setLinkCategoryId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [linkCategoryId]);

  const handleChangeCategory = async (linkId: string, newCategoryId: string) => {
    setLinkCategoryId(null);
    const prevLinks = links;
    const localCat = categories.find((c) => c.id === newCategoryId);
    // 乐观更新
    setData( (prev) =>
      prev.map((l) =>
        (l as LinkType).id === linkId
          ? { ...(l as LinkType), categoryId: newCategoryId, category: localCat }
          : l
      )
    );
    setCategoryUpdating((prev) => ({ ...prev, [linkId]: true }));
    try {
      const res = await fetch(`/api/links/${linkId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: newCategoryId }),
      });
      if (res.ok) {
        const updated = await res.json();
        setData( (prev) =>
          prev.map((l) =>
            (l as LinkType).id === linkId
              ? { ...(l as LinkType), categoryId: updated.categoryId, category: updated.category || localCat }
              : l
          )
        );
        toast.success("分类已更新");
      } else {
        setData( () => prevLinks);
        const err = await res.json();
        toast.error(err.error || "操作失败");
      }
    } catch {
      setData( () => prevLinks);
      toast.error("操作失败");
    } finally {
      setCategoryUpdating((prev) => ({ ...prev, [linkId]: false }));
    }
  };

  const handleToggleAccess = async (linkId: string, currentPrivate: boolean) => {
    setLinkAccessId(null);
    const prevLinks = links;
    const newPrivate = !currentPrivate;
    // 乐观更新
    setData( (prev) =>
      prev.map((l) => (l as LinkType).id === linkId ? { ...(l as LinkType), isPrivate: newPrivate } : l)
    );
    setLinkUpdating((prev) => ({ ...prev, [linkId]: true }));
    try {
      const res = await fetch(`/api/links/${linkId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrivate: newPrivate }),
      });
      if (res.ok) {
        const updated = await res.json();
        setData( (prev) =>
          prev.map((l) => (l as LinkType).id === linkId ? { ...(l as LinkType), isPrivate: updated.isPrivate } : l)
        );
        toast.success(updated.isPrivate ? "已设为私有" : "已设为公开");
      } else {
        setData( () => prevLinks);
        const err = await res.json();
        toast.error(err.error || "操作失败");
      }
    } catch {
      setData( () => prevLinks);
      toast.error("操作失败");
    } finally {
      setLinkUpdating((prev) => ({ ...prev, [linkId]: false }));
    }
  };

  // 从缓存恢复连通性检测结果
  useEffect(() => {
    const cached = readPageCache<Record<string, string>>("CheckResult", 1, uid);
    if (cached && cached.data.length > 0) {
      setCheckResults(cached.data[0]);
    }
  }, [uid]);

  // 连通性检测结果变化时持久化到缓存
  useEffect(() => {
    if (Object.keys(checkResults).length > 0) {
      writePageCache("CheckResult", 1, [checkResults], 1, 0, uid);
    }
  }, [checkResults, uid]);

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

  // 批量勾选：全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredLinks.length && filteredLinks.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredLinks.map((l) => l.id)));
    }
  };

  // 批量勾选：单行切换
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 批量移动
  const handleBatchMove = async () => {
    if (!batchDialogMoveTargetId || selectedIds.size === 0) return;
    setIsBatchMoving(true);
    const targetId = batchDialogMoveTargetId;
    const ids = Array.from(selectedIds);
    const prevLinks = [...links];

    // 乐观更新
    setData((prev) =>
      prev.map((l) => {
        if (ids.includes((l as LinkType).id)) {
          const targetCat = categories.find((c) => c.id === targetId);
          return {
            ...l,
            categoryId: targetId,
            category: targetCat
              ? { id: targetCat.id, name: targetCat.name, icon: targetCat.icon }
              : (l as LinkType).category,
          } as LinkType;
        }
        return l;
      })
    );

    const results = await Promise.allSettled(
      ids.map((linkId) =>
        fetch(`/api/links/${linkId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId: targetId }),
        }).then((r) => {
          if (!r.ok) throw new Error("Move failed");
        })
      )
    );

    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      setData(() => prevLinks);
      toast.error(`${failed} 个链接移动失败，已回滚`);
    } else {
      toast.success(`已将 ${ids.length} 个链接移动到目标分类`);
    }

    setSelectedIds(new Set());
    setBatchDialog(null);
    setBatchDialogMoveTargetId("");
    setIsBatchMoving(false);
    setIsSelectMode(false);
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsBatchDeleting(true);
    const ids = Array.from(selectedIds);
    const prevLinks = [...links];

    // 乐观删除
    setData((prev) => prev.filter((l) => !ids.includes((l as LinkType).id)));

    const results = await Promise.allSettled(
      ids.map((linkId) =>
        fetch(`/api/links/${linkId}`, { method: "DELETE" }).then((r) => {
          if (!r.ok) throw new Error("Delete failed");
        })
      )
    );

    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      setData(() => prevLinks);
      toast.error(`${failed} 个链接删除失败，已回滚`);
    } else {
      toast.success(`已删除 ${ids.length} 个链接`);
    }

    setSelectedIds(new Set());
    setBatchDialog(null);
    setIsBatchDeleting(false);
    setIsSelectMode(false);
  };

  // 批量移动可用的目标分类：若全部选中链接都在同一分类，则排除该分类
  const batchMoveCategories = useMemo(() => {
    if (selectedIds.size === 0) return [];
    const selectedLinks = links.filter((l) => selectedIds.has(l.id));
    const currentCatIds = new Set(selectedLinks.map((l) => l.categoryId));
    // 如果所有选中链接都在同一个分类，排除那个分类
    if (currentCatIds.size === 1) {
      return categories.filter((c) => c.id !== [...currentCatIds][0]);
    }
    return categories;
  }, [categories, links, selectedIds]);

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

  const filteredLinks = links
    .filter((link) => {
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

      // 创建人筛选
      const matchesCreator =
        creatorFilter === "all" || link.user?.id === creatorFilter;

      return matchesSearch && matchesCategory && matchesAccess && matchesConnectivity && matchesCreator;
    })
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  const stats = {
    totalLinks: total,
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
              共 {total} 个链接
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
                  minWidth: `${categoryDropdownMinW}px`,
                }}
                className="z-[9999] max-h-[240px] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1"
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
                    <span className="flex-1 text-left truncate">{c.name}</span>
                    {c.isPublic ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-px rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 flex-shrink-0">
                        <Globe className="h-2.5 w-2.5" />
                        公开
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-px rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 flex-shrink-0">
                        <Lock className="h-2.5 w-2.5" />
                        私有
                      </span>
                    )}
                    <span className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center">
                      {categoryFilter === c.id && <Check className="h-3.5 w-3.5 text-violet-500" />}
                    </span>
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
              {accessFilter === "all" ? "访问权限" : accessFilter === "public" ? "公开" : "私有"}
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
          {/* Creator Filter — 创建人筛选 */}
          <div className="relative">
            <button
              ref={creatorBtnRef}
              onClick={() => setCreatorMenuOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-700 transition-all cursor-pointer h-9"
            >
              <User className="h-3.5 w-3.5 text-slate-400" />
              {creatorFilter === "all"
                ? "创建人"
                : uniqueCreators.find((c) => c.id === creatorFilter)?.name || "创建人"}
              <ChevronDown className="h-3 w-3 opacity-50" />
            </button>
            {creatorMenuOpen && createPortal(
              <div
                ref={creatorMenuRef}
                style={{
                  position: "fixed",
                  top: (creatorBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                  left: (creatorBtnRef.current?.getBoundingClientRect().left ?? 0) + (creatorBtnRef.current?.getBoundingClientRect().width ?? 0) / 2,
                  transform: "translateX(-50%)",
                  minWidth: "140px",
                }}
                className="z-[9999] max-h-[240px] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1"
              >
                <button
                  onClick={() => { setCreatorFilter("all"); setCreatorMenuOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-700",
                    creatorFilter === "all" ? "text-slate-900 dark:text-white font-medium" : "text-slate-600 dark:text-slate-400"
                  )}
                >
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span className="flex-1 text-left">全部</span>
                  {creatorFilter === "all" && <Check className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />}
                </button>
                {uniqueCreators.map((creator) => (
                  <button
                    key={creator.id}
                    onClick={() => { setCreatorFilter(creator.id); setCreatorMenuOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-700",
                      creatorFilter === creator.id ? "text-slate-900 dark:text-white font-medium" : "text-slate-600 dark:text-slate-400"
                    )}
                  >
                    <User className="h-3.5 w-3.5 text-slate-500" />
                    <span className="flex-1 text-left truncate">{creator.name}</span>
                    {creatorFilter === creator.id && <Check className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />}
                  </button>
                ))}
              </div>,
              document.body
            )}
          </div>
        </div>

        {/* Links Table */}
        <div className="animate-fade-in-up delay-300">
        <div className="action-card" style={{ "--accent-color": "#3b82f6", overflow: "visible" } as React.CSSProperties}>
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
            <Button
              size="sm"
              variant="outline"
              className="h-9 text-xs"
              onClick={() => {
                if (isSelectMode) {
                  setSelectedIds(new Set());
                  setBatchDialogMoveTargetId("");
                  setIsSelectMode(false);
                } else {
                  setIsSelectMode(true);
                }
              }}
            >
              {isSelectMode ? (
                <>
                  <X className="h-3.5 w-3.5 mr-1" />
                  取消选择
                </>
              ) : (
                <>
                  <CheckSquare className="h-3.5 w-3.5 mr-1" />
                  多选
                </>
              )}
            </Button>
          </div>

          {/* 批量操作栏 */}
          {isSelectMode && selectedIds.size > 0 && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-primary/10 dark:bg-primary/10 border border-primary/30 dark:border-primary/30 flex items-center gap-3">
              <span className="text-sm font-medium text-primary dark:text-primary">
                已选 <strong>{selectedIds.size}</strong> 个链接
              </span>
              <div className="flex-1" />
              <Button
                size="sm"
                variant="default"
                className="h-8 text-xs"
                onClick={() => { setBatchDialogMoveTargetId(""); setBatchDialog({ type: "move" }); }}
              >
                <Folders className="h-3.5 w-3.5 mr-1" />
                批量移动
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-8 text-xs"
                onClick={() => setBatchDialog({ type: "delete" })}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                批量删除
              </Button>
            </div>
          )}
          {isSelectMode && selectedIds.size === 0 && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-500/10 border border-slate-200 dark:border-slate-500/30 flex items-center gap-3">
              <span className="text-sm text-muted-foreground">请勾选需要操作的链接</span>
            </div>
          )}

          <div className="overflow-visible">
            <table className="w-full caption-bottom text-sm">
              <TableHeader>
                <TableRow>
                  {isSelectMode && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          selectedIds.size === filteredLinks.length && filteredLinks.length > 0
                            ? true
                            : selectedIds.size > 0
                            ? "indeterminate"
                            : false
                        }
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                  )}
                  <TableHead className="w-[250px]">标题</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>分类</TableHead>
                  <TableHead>访问权限</TableHead>
                  <TableHead>连通性</TableHead>
                  <TableHead>创建人</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLinks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isSelectMode ? 8 : 7} className="text-center py-8">
                      没有找到链接
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLinks.map((link) => (
                    <TableRow key={link.id}>
                      {isSelectMode && (
                        <TableCell className="w-10">
                          <Checkbox
                            checked={selectedIds.has(link.id)}
                            onCheckedChange={() => toggleSelect(link.id)}
                          />
                        </TableCell>
                      )}
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
                      <TableCell>
                        <div className="relative inline-block">
                          <button
                            onClick={() => {
                              setLinkCategoryId(linkCategoryId === link.id ? null : link.id);
                            }}
                            disabled={categoryUpdating[link.id]}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ring-1 bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-700"
                          >
                            {categoryUpdating[link.id] ? (
                              <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                            ) : (
                              <DynamicIcon name={link.category?.icon || "Folder"} className="h-3 w-3 text-slate-500" />
                            )}
                            {link.category?.name || "未分类"}
                            <ChevronDown className="h-3 w-3 opacity-50" />
                          </button>
                          {linkCategoryId === link.id && (
                            <div
                              ref={linkCategoryMenuRef}
                              className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 max-h-[240px] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1"
                              style={{ minWidth: `${categoryDropdownMinW}px` }}
                            >
                              {categories.map((c) => (
                                <button
                                  key={c.id}
                                  onClick={() => handleChangeCategory(link.id, c.id)}
                                  disabled={categoryUpdating[link.id]}
                                  className={cn(
                                    "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-700",
                                    link.categoryId === c.id
                                      ? "text-slate-900 dark:text-white font-medium"
                                      : "text-slate-600 dark:text-slate-400"
                                  )}
                                >
                                  <DynamicIcon name={c.icon || "Folder"} className="h-3.5 w-3.5 text-slate-500" />
                                  <span className="flex-1 text-left truncate">{c.name}</span>
                                  {c.isPublic ? (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-px rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 flex-shrink-0">
                                      <Globe className="h-2.5 w-2.5" />
                                      公开
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-px rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 flex-shrink-0">
                                      <Lock className="h-2.5 w-2.5" />
                                      私有
                                    </span>
                                  )}
                                  <span className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center">
                                    {link.categoryId === c.id && <Check className="h-3.5 w-3.5 text-violet-500" />}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="relative inline-block">
                          <button
                            onClick={() => {
                              setLinkAccessId(linkAccessId === link.id ? null : link.id);
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
                          {linkAccessId === link.id && (
                            <div
                              ref={linkAccessMenuRef}
                              className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 min-w-[120px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1"
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
                            </div>
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
                      <TableCell>
                        {link.user ? (
                          <span className="text-muted-foreground truncate block max-w-[120px]" title={link.user.name || link.user.username || ""}>
                            {link.user.name || link.user.username || "未知"}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500 italic">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEditLink(link)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </table>
          </div>
        </div>
        </div>

        {/* 无限滚动哨兵 */}
        <div ref={sentinelRef} className="flex justify-center py-6">
          {isLoadingMore && (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>


      {/* Batch Operation Dialog */}
      <Dialog open={!!batchDialog} onOpenChange={() => { setBatchDialog(null); setBatchDialogMoveTargetId(""); }}>
        <DialogContent className="sm:max-w-md">
          {batchDialog?.type === "delete" ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  批量删除
                </DialogTitle>
                <DialogDescription className="pt-2">
                  <p>
                    确定要删除已选中的{" "}
                    <strong className="text-slate-800 dark:text-slate-200">
                      {selectedIds.size} 个
                    </strong>{" "}
                    链接吗？
                  </p>
                  <p className="mt-2 text-red-500 dark:text-red-400 text-sm">
                    此操作不可撤销。
                  </p>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => setBatchDialog(null)}
                  disabled={isBatchDeleting}
                >
                  取消
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleBatchDelete}
                  disabled={isBatchDeleting}
                >
                  {isBatchDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-1" />
                  )}
                  确认删除
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Folders className="h-5 w-5 text-violet-500" />
                  批量移动
                </DialogTitle>
                <DialogDescription className="pt-2">
                  <p>
                    将已选中的{" "}
                    <strong className="text-slate-800 dark:text-slate-200">
                      {selectedIds.size} 个
                    </strong>{" "}
                    链接移动到指定分类
                  </p>
                  <div className="mt-3">
                    <Select value={batchDialogMoveTargetId} onValueChange={setBatchDialogMoveTargetId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="选择目标分类" />
                      </SelectTrigger>
                      <SelectContent>
                        {batchMoveCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => setBatchDialog(null)}
                  disabled={isBatchMoving}
                >
                  取消
                </Button>
                <Button
                  variant="default"
                  onClick={handleBatchMove}
                  disabled={!batchDialogMoveTargetId || isBatchMoving}
                >
                  {isBatchMoving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <MoveRight className="h-4 w-4 mr-1" />
                  )}
                  确认移动
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
