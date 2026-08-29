"use client";

import React, { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { Plus, Trash2, Edit, Folder, FolderOpen, Loader2, Globe, EyeOff, ChevronDown, Check, AlertTriangle } from "lucide-react";
import { DynamicIcon } from "@/components/DynamicIcon";
import { AdminLayout } from "@/components/AdminLayout";
import { IconPicker } from "@/components/IconPicker";
import { notifyDataChanged } from "@/lib/cache-client";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import type { Category, Link as LinkType } from "@/types";
import { useDataCache } from "@/hooks/useDataCache";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";

const LINK_PREVIEW_COUNT = 2;

function CategoryIcon({ icon, className }: { icon?: string | null; className?: string }) {
  return <DynamicIcon name={icon || "Folder"} className={className || "h-4 w-4 text-muted-foreground"} />;
}

export default function CategoriesPage() {
  const { data: session } = useSession();
  const uid = session?.user?.id;
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  // 判断当前用户是否可以管理此分类（编辑/删除/切换可见性）
  // 规则：自己的分类（公开/私有）均可管理；管理员额外可管理所有公开分类，不能管理他人私有分类
  const canManage = (category: Category) => {
    if (category.userId === uid) return true;
    return isAdmin && category.isPublic;
  };

  // 链接可编辑边界（与服务端一致）：自己的链接可编辑；管理员可编辑所有公开链接
  const canEditLink = (link: LinkType) => {
    if (link.userId === uid) return true;
    return isAdmin && !link.isPrivate;
  };

  // Category 数据
  const { data: cacheData, loading: _loading, syncing: _syncing, setData } = useDataCache({
    configs: [
    { name: "Category:mgmt:v2", versionTable: "Category", fetch: () => fetch("/api/categories?scope=manage").then(r => r.json()).then(d => ({ data: d, total: d.length })) },
  ], userId: uid });

  // Link 数据 — 与首页/链接管理页共用同一套数据源（name/pageSize/fetch 一致 → 同一缓存、同一版本号）：
  // 数据范围 = home 可见性（自己的全部含私有 + 他人公开），普通用户在渲染层过滤出"仅自己的"。
  const { items: allLinks, isLoadingMore, sentinelRef, setItems: setLinkData } = useInfiniteScroll<LinkType>({
    name: "Link",
    versionTable: "Link",
    userId: uid,
    pageSize: 1000,
    fetchFn: (page, pageSize) =>
      fetch(`/api/links?page=${page}&pageSize=${pageSize}&sort=recent`)
        .then(r => r.json())
        .then((d: { data: LinkType[]; total: number }) => ({ data: d.data, total: d.total })),
  });

  const categories = (cacheData["Category:mgmt:v2"] || []) as Category[];

  // 分类表格的链接预览/数量展示 home 可读范围（所有用户公开链接 + 自己的全部含私有）
  const categoryLinks = useMemo(() => {
    const grouped: Record<string, LinkType[]> = {};
    allLinks.forEach((link) => {
      const cid = link.categoryId;
      if (!grouped[cid]) grouped[cid] = [];
      grouped[cid].push(link);
    });
    for (const cid of Object.keys(grouped)) {
      grouped[cid].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }
    return grouped;
  }, [allLinks]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 编辑时移动所有链接到目标分类
  const [moveTargetCategoryId, setMoveTargetCategoryId] = useState<string>("");

  const [formData, setFormData] = useState({
    name: "",
    parentId: "",
    icon: "",
    isPublic: false,
  });

  // 可见性筛选
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "public" | "private">("all");
  const [visMenuOpen, setVisMenuOpen] = useState(false);
  const visBtnRef = useRef<HTMLButtonElement>(null);
  const visMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!visMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (visMenuRef.current && !visMenuRef.current.contains(e.target as Node)) {
        setVisMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [visMenuOpen]);

  // 逐行可见性切换
  const [catVisibilityId, setCatVisibilityId] = useState<string | null>(null);
  const catVisMenuRef = useRef<HTMLDivElement>(null);
  const [categoryUpdating, setCategoryUpdating] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!catVisibilityId) return;
    const handler = (e: MouseEvent) => {
      if (catVisMenuRef.current && !catVisMenuRef.current.contains(e.target as Node)) {
        setCatVisibilityId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [catVisibilityId]);

  const handleSetVisibility = async (categoryId: string, targetPublic: boolean) => {
    setCatVisibilityId(null);
    const prevCategories = [...categories];
    // 乐观更新
    setData("Category:mgmt:v2", (prev) =>
      (prev as Category[]).map((c) =>
        c.id === categoryId ? { ...c, isPublic: targetPublic } : c
      )
    );
    setCategoryUpdating((prev) => ({ ...prev, [categoryId]: true }));
    try {
      const res = await fetch(`/api/categories/${categoryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: targetPublic }),
      });
      if (res.ok) {
        const updated = await res.json();
        setData("Category:mgmt:v2", (prev) =>
          (prev as Category[]).map((c) =>
            c.id === categoryId ? { ...c, isPublic: updated.isPublic } : c
          )
        );
        toast.success(updated.isPublic ? "已设为公开" : "已设为私有");
        notifyDataChanged("Category");
        notifyDataChanged("Link");
        refreshLinks();
      } else {
        setData("Category:mgmt:v2", () => prevCategories);
        const err = await res.json();
        toast.error(err.error || "操作失败");
      }
    } catch {
      setData("Category:mgmt:v2", () => prevCategories);
      toast.error("操作失败");
    } finally {
      setCategoryUpdating((prev) => ({ ...prev, [categoryId]: false }));
    }
  };

  // CRUD 后手动刷新数据
  const refreshCategories = async () => {
    try {
      const res = await fetch("/api/categories?scope=manage");
      if (res.ok) {
        const data = await res.json();
        setData("Category:mgmt:v2", () => data);
      }
    } catch { /* silent */ }
  };

  const refreshLinks = async () => {
    try {
      // 与主数据源一致（首页共用 name="Link" + home scope + 全量 pageSize），
      // 避免 setLinkData 用错误范围/不完整数据覆盖列表
      const res = await fetch("/api/links?page=1&pageSize=1000&sort=recent");
      if (res.ok) {
        const { data: all } = await res.json();
        setLinkData(() => all);
      }
    } catch { /* silent */ }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("请输入分类名称");
      return;
    }

    setIsSubmitting(true);
    try {
      // 如果是编辑，且选择了移动目标分类，则将当前分类下所有链接移走
      if (editingCategory && moveTargetCategoryId && moveTargetCategoryId !== "_keep") {
        // 仅移动当前用户可编辑的链接（他人公开链接不可被移动）
        const currentLinks = (categoryLinks[editingCategory.id] || []).filter((link) => canEditLink(link));
        const results = await Promise.allSettled(
          currentLinks.map((link) =>
            fetch(`/api/links/${link.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ categoryId: moveTargetCategoryId }),
            })
          )
        );
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
          toast.error(`${failed} 个链接移动失败`);
        }

      }

      const url = editingCategory
        ? `/api/categories/${editingCategory.id}`
        : "/api/categories";
      const method = editingCategory ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          icon: formData.icon || null,
          parentId: formData.parentId || null,
          isPublic: formData.isPublic,
        }),
      });

      if (response.ok) {
        toast.success(editingCategory ? "分类已更新" : "分类已创建");
        setIsDialogOpen(false);
        setEditingCategory(null);
        setFormData({ name: "", parentId: "", icon: "", isPublic: false });
        setMoveTargetCategoryId("");
        // 广播：分类变更（含编辑弹窗里的 isPublic 开关）影响链接可见范围，
        // 可能已批量移动链接 → 双发，让首页/分类页等已打开页面实时刷新
        notifyDataChanged("Category");
        notifyDataChanged("Link");
        await Promise.all([refreshCategories(), refreshLinks()]);
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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const prevCategories = [...categories];
    const target = deleteTarget;
    // 乐观删除
    setData("Category:mgmt:v2", (prev) => (prev as Category[]).filter((c) => c.id !== target.id));
    setDeleteTarget(null);

    try {
      const response = await fetch(`/api/categories/${target.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("分类已删除");
        // 删除分类会级联删除其下链接 → 双发广播，首页/分类页等已打开页面实时刷新
        notifyDataChanged("Category");
        notifyDataChanged("Link");
        refreshLinks();
      } else {
        // 回滚
        setData("Category:mgmt:v2", () => prevCategories);
        const err = await response.json();
        toast.error(err.error || "删除失败");
      }
    } catch {
      setData("Category:mgmt:v2", () => prevCategories);
      toast.error("删除失败");
    } finally {
      setIsDeleting(false);
    }
  };

  const openEditDialog = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      parentId: category.parentId || "",
      icon: category.icon || "",
      isPublic: category.isPublic,
    });
    setMoveTargetCategoryId("");
    setIsDialogOpen(true);
  };

  const openAddDialog = () => {
    setEditingCategory(null);
    setFormData({ name: "", parentId: "", icon: "", isPublic: false });
    setMoveTargetCategoryId("");
    setIsDialogOpen(true);
  };

  const rootCategories = categories.filter((c) => !c.parentId);

  const stats = {
    // 统一基于 allLinks（home 可读范围），与链接管理页/仪表盘口径一致
    totalLinks: allLinks.length,
    totalCategories: categories.length,
    publicLinks: allLinks.filter((l) => !l.isPrivate).length,
    privateLinks: allLinks.filter((l) => l.isPrivate).length,
  };

  const renderLinkPreview = (categoryId: string) => {
    const links = categoryLinks[categoryId] || [];
    if (links.length === 0) {
      return <span className="text-xs text-muted-foreground italic">暂无链接</span>;
    }
    const displayLinks = links.slice(0, LINK_PREVIEW_COUNT);
    const remaining = links.length - LINK_PREVIEW_COUNT;
    return (
      <div className="flex items-center gap-1 overflow-hidden whitespace-nowrap">
        {displayLinks.map((link) => (
          <span
            key={link.id}
            className="inline-block max-w-[45%] truncate text-xs bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground px-1.5 py-0.5 rounded shrink-0"
            title={link.title}
          >
            {link.title}
          </span>
        ))}
        {remaining > 0 && (
          <span className="text-xs text-primary dark:text-primary font-medium shrink-0">
            +{remaining}
          </span>
        )}
      </div>
    );
  };

  const renderCategoryRow = (category: Category, isChild = false) => {
    const links = categoryLinks[category.id] || [];
    const manageable = canManage(category);
    return (
      <TableRow key={category.id}>
        <TableCell className={isChild ? "font-medium pl-8 overflow-hidden" : "font-medium overflow-hidden"}>
          <div className="flex items-center gap-2 min-w-0">
            <CategoryIcon icon={category.icon} className="shrink-0" />
            <span className="truncate">{category.name}</span>
          </div>
        </TableCell>
        <TableCell>
          <span className={isChild
            ? "text-xs bg-success-muted text-success-muted-foreground px-2 py-0.5 rounded"
            : "text-xs bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary px-2 py-0.5 rounded"
          }>
            {isChild ? "子分类" : "父分类"}
          </span>
        </TableCell>
        <TableCell className="overflow-hidden">
          {renderLinkPreview(category.id)}
        </TableCell>
        <TableCell className="text-center">
          <span className="text-sm font-medium">{links.length}</span>
        </TableCell>
        <TableCell>
          {manageable ? (
            <div className="relative inline-block">
              <button
                onClick={() => {
                  setCatVisibilityId(catVisibilityId === category.id ? null : category.id);
                }}
                disabled={categoryUpdating[category.id]}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ring-1",
                  category.isPublic
                    ? "bg-success-muted text-success-muted-foreground ring-success/20 hover:bg-success-muted/60"
                    : "bg-warning-muted text-warning-muted-foreground ring-warning/20 hover:bg-warning-muted/60"
                )}
              >
                {categoryUpdating[category.id] ? (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                ) : category.isPublic ? (
                  <Globe className="h-3 w-3 text-success" />
                ) : (
                  <EyeOff className="h-3 w-3 text-warning" />
                )}
                {category.isPublic ? "公开" : "私有"}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </button>
              {catVisibilityId === category.id && (
                <div
                  ref={catVisMenuRef}
                  className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 min-w-[120px] rounded-lg border border-border bg-card shadow-lg py-1"
                >
                  {([
                    { value: true, label: "公开", Icon: Globe, color: "text-success" },
                    { value: false, label: "私有", Icon: EyeOff, color: "text-warning" },
                  ] as const).map(({ value, label, Icon, color }) => (
                    <button
                      key={String(value)}
                      onClick={() => handleSetVisibility(category.id, value)}
                      disabled={categoryUpdating[category.id]}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-muted",
                        category.isPublic === value ? "text-foreground font-medium" : "text-muted-foreground"
                      )}
                    >
                      <Icon className={cn("h-3.5 w-3.5", color)} />
                      <span className="flex-1 text-left">{label}</span>
                      {category.isPublic === value && <Check className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className={cn(
              "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ring-1",
              category.isPublic
                ? "bg-success-muted text-success-muted-foreground ring-success/20"
                : "bg-warning-muted text-warning-muted-foreground ring-warning/20"
            )}>
              {category.isPublic ? (
                <>
                  <Globe className="h-3 w-3 text-success" />
                  公开
                </>
              ) : (
                <>
                  <EyeOff className="h-3 w-3 text-warning" />
                  私有
                </>
              )}
            </span>
          )}
        </TableCell>
        <TableCell>
          {category.user ? (
            <span className="text-muted-foreground truncate block max-w-[120px]" title={category.user.name || category.user.username || ""}>
              {category.user.name || category.user.username || "未知"}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground italic">—</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            {manageable ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => openEditDialog(category)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setDeleteTarget(category)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground italic">只读</span>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <AdminLayout stats={stats}>
      <div className="dashboard-container space-y-8">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-space-grotesk)" }}>分类管理</h1>
            <p className="text-muted-foreground">
              共 {categories.length} 个分类
            </p>
          </div>

          {/* Stats Cards */}
          <div className="hidden md:flex items-center gap-3 animate-fade-in-up delay-200">
            <div className="glass-effect rounded-full px-4 py-2 flex items-center gap-2">
              <Folder className="h-4 w-4 text-violet-500" />
              <span className="text-sm font-medium">{stats.totalCategories} 个分类</span>
            </div>
            <div className="glass-effect rounded-full px-4 py-2 flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{stats.totalLinks} 个链接</span>
            </div>
          </div>

          {/* 分类新增/编辑弹窗 */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openAddDialog}>
                <Plus className="h-4 w-4 mr-2" />
                添加分类
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingCategory ? "编辑分类" : "添加新分类"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">分类名称 <span className="text-danger">*</span></Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="分类名称"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>分类图标</Label>
                  <div className="mt-1">
                    <IconPicker
                      value={formData.icon}
                      onChange={(icon) => setFormData({ ...formData, icon })}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="parent">父分类</Label>
                  <Select
                    value={formData.parentId || "none"}
                    onValueChange={(value) =>
                      setFormData({ ...formData, parentId: value === "none" ? "" : value })
                    }
                  >
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue placeholder="无（顶级分类）" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">无（顶级分类）</SelectItem>
                      {rootCategories
                        .filter((c) => c.id !== editingCategory?.id)
                        .map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 公开/私有开关 */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="isPublic">公开分类</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      公开后所有用户可见，关闭后仅自己可见
                    </p>
                  </div>
                  <Switch
                    id="isPublic"
                    checked={formData.isPublic}
                    onCheckedChange={(checked) => {
                      if (!isAdmin && checked) {
                        toast.error("仅管理员可设置公开分类");
                        return;
                      }
                      setFormData({ ...formData, isPublic: checked });
                    }}
                    disabled={!isAdmin && !formData.isPublic}
                  />
                </div>

                {/* 编辑时，可选择将当前分类下所有链接移动到其他分类 */}
                {editingCategory && (() => {
                  const linkCount = (categoryLinks[editingCategory.id] || []).length;
                  if (linkCount === 0) return null;
                  const otherCategories = categories.filter((c) => c.id !== editingCategory.id);
                  return (
                    <div>
                      <Label className="mb-2 block">
                        移动全部链接（{linkCount} 个）
                      </Label>
                      {otherCategories.length === 0 ? (
                        <p className="text-xs text-muted-foreground">没有其他分类可接收链接</p>
                      ) : (
                        <Select
                          value={moveTargetCategoryId}
                          onValueChange={setMoveTargetCategoryId}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="保持当前分类（不移动）" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_keep">保持当前分类（不移动）</SelectItem>
                            {otherCategories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                {cat.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        选择后将把该分类下的所有链接批量移动到目标分类
                      </p>
                    </div>
                  );
                })()}

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    取消
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "处理中..." : editingCategory ? "更新" : "创建"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Categories Table */}
        <div className="animate-fade-in-up delay-300">
        <div className="action-card" style={{ "--accent-color": "#8b5cf6" } as React.CSSProperties}>
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <FolderOpen className="h-6 w-6 text-violet-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1" style={{ fontFamily: "var(--font-space-grotesk)" }}>分类列表</h3>
              <p className="text-sm text-muted-foreground">
                管理你的分类结构
              </p>
            </div>
          </div>

          {/* Visibility Filter */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative">
              <button
                ref={visBtnRef}
                onClick={() => setVisMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-muted text-muted-foreground ring-1 ring-border hover:bg-accent dark:bg-muted dark:text-muted-foreground dark:ring-border dark:hover:bg-accent transition-all cursor-pointer h-9"
              >
                {visibilityFilter === "all" ? (
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                ) : visibilityFilter === "public" ? (
                  <Globe className="h-3.5 w-3.5 text-success" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 text-warning" />
                )}
                {visibilityFilter === "all" ? "全部可见性" : visibilityFilter === "public" ? "公开" : "私有"}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </button>
              {visMenuOpen && createPortal(
                <div
                  ref={visMenuRef}
                  style={{
                    position: "fixed",
                    top: (visBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                    left: (visBtnRef.current?.getBoundingClientRect().left ?? 0) + (visBtnRef.current?.getBoundingClientRect().width ?? 0) / 2,
                    transform: "translateX(-50%)",
                  }}
                  className="z-[9999] min-w-[120px] rounded-lg border border-border bg-card shadow-lg py-1"
                >
                  {([
                    { value: "all", label: "全部", Icon: Globe, color: "text-muted-foreground" },
                    { value: "public", label: "公开", Icon: Globe, color: "text-success" },
                    { value: "private", label: "私有", Icon: EyeOff, color: "text-warning" },
                  ] as const).map(({ value, label, Icon, color }) => (
                    <button
                      key={value}
                      onClick={() => {
                        setVisibilityFilter(value);
                        setVisMenuOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-muted",
                        visibilityFilter === value
                          ? "text-foreground font-medium"
                          : "text-muted-foreground"
                      )}
                    >
                      <Icon className={cn("h-3.5 w-3.5", color)} />
                      <span className="flex-1 text-left">{label}</span>
                      {visibilityFilter === value && (
                        <Check className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>,
                document.body
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead style={{ width: "14%" }}>名称</TableHead>
                  <TableHead style={{ width: "7%" }}>类型</TableHead>
                  <TableHead style={{ width: "28%" }}>具体链接</TableHead>
                  <TableHead style={{ width: "7%" }} className="text-center">数量</TableHead>
                  <TableHead style={{ width: "12%" }}>可见性</TableHead>
                  <TableHead style={{ width: "14%" }}>创建人</TableHead>
                  <TableHead style={{ width: "18%" }} className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rootCategories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8">
                      <Empty>
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <Folder className="size-5" />
                          </EmptyMedia>
                          <EmptyTitle>没有分类</EmptyTitle>
                          <EmptyDescription>创建一个分类开始整理你的书签吧</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                ) : (
                  rootCategories.map((category) => (
                    <Fragment key={category.id}>
                      {renderCategoryRow(category, false)}
                      {category.children?.map((child) => (
                        <Fragment key={child.id}>
                          {renderCategoryRow(child, true)}
                        </Fragment>
                      ))}
                    </Fragment>
                  ))
                )}
              </TableBody>
            </Table>
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-danger" />
              确认删除
            </DialogTitle>
            <DialogDescription className="pt-2">
              <p>
                确定要删除分类{" "}
                <strong className="text-foreground">
                  {deleteTarget?.name}
                </strong>
                {" "}吗？
              </p>
              <p className="mt-2 text-danger text-sm">
                此操作不可撤销，该分类下的所有链接将被同时删除。
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" />
              )}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
