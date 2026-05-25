"use client";

import React, { useState, useMemo, Fragment } from "react";
import { useSession } from "next-auth/react";
import { Plus, Trash2, Edit, Folder, FolderOpen } from "lucide-react";
import { DynamicIcon } from "@/components/DynamicIcon";
import { AdminLayout } from "@/components/AdminLayout";
import { IconPicker } from "@/components/IconPicker";
import { CategoryLinkManager } from "@/components/CategoryLinkManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
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
import toast from "react-hot-toast";
import type { Category, Link as LinkType } from "@/types";
import { useDataCache } from "@/hooks/useDataCache";

const LINK_PREVIEW_COUNT = 2;

function CategoryIcon({ icon, className }: { icon?: string | null; className?: string }) {
  return <DynamicIcon name={icon || "Folder"} className={className || "h-4 w-4 text-muted-foreground"} />;
}

export default function CategoriesPage() {
  const { data: session } = useSession();

  const { data: cacheData, loading: _loading, syncing: _syncing, setData } = useDataCache([
    { name: "Category", fetch: () => fetch("/api/categories").then(r => r.json()).then(d => ({ data: d, total: d.length })) },
    { name: "Link", fetch: () => fetch("/api/links?includePrivate=true&pageSize=200").then(r => r.json()).then(d => ({ data: d.data, total: d.total })) },
  ]);

  const categories = (cacheData["Category"] || []) as Category[];
  const allLinks = (cacheData["Link"] || []) as LinkType[];

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

  // 编辑时待提交的链接选择
  const [pendingLinkIds, setPendingLinkIds] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    name: "",
    parentId: "",
    icon: "",
  });

  // CRUD 后手动刷新数据
  const refreshCategories = async () => {
    try {
      const res = await fetch("/api/categories");
      if (res.ok) {
        const data = await res.json();
        setData("Category", () => data);
      }
    } catch { /* silent */ }
  };

  const refreshLinks = async () => {
    try {
      const res = await fetch("/api/links?includePrivate=true&pageSize=200");
      if (res.ok) {
        const { data: all } = await res.json();
        setData("Link", () => all);
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
      // 如果是编辑，先处理链接变更
      if (editingCategory) {
        const originalLinks = categoryLinks[editingCategory.id] || [];
        const originalIds = new Set(originalLinks.map((l) => l.id));
        const pendingIds = new Set(pendingLinkIds);

        // 移除的链接 → 移到第一个其他分类
        const removedIds = originalLinks
          .filter((l) => !pendingIds.has(l.id))
          .map((l) => l.id);
        const fallbackCategory = categories.find((c) => c.id !== editingCategory.id);
        for (const linkId of removedIds) {
          if (fallbackCategory) {
            await fetch(`/api/links/${linkId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ categoryId: fallbackCategory.id }),
            });
          }
        }

        // 新增的链接 → 移到当前分类
        const addedIds = Array.from(pendingIds).filter((id) => !originalIds.has(id));
        for (const linkId of addedIds) {
          await fetch(`/api/links/${linkId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ categoryId: editingCategory.id }),
          });
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
        }),
      });

      if (response.ok) {
        toast.success(editingCategory ? "分类已更新" : "分类已创建");
        setIsDialogOpen(false);
        setEditingCategory(null);
        setFormData({ name: "", parentId: "", icon: "" });
        setPendingLinkIds([]);
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

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个分类吗？分类下的链接也会被删除。")) return;

    const prevCategories = [...categories];
    // 乐观删除（策略4：先更新视图，页面瞬时响应）
    setData("Category", (prev) => (prev as Category[]).filter((c) => c.id !== id));

    try {
      const response = await fetch(`/api/categories/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("分类已删除");
        refreshLinks();
      } else {
        // 回滚
        setData("Category", () => prevCategories);
        toast.error("删除失败");
      }
    } catch {
      setData("Category", () => prevCategories);
      toast.error("删除失败");
    }
  };

  const openEditDialog = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      parentId: category.parentId || "",
      icon: category.icon || "",
    });
    // 初始化待提交链接列表为当前分类下的链接ID
    const currentLinks = categoryLinks[category.id] || [];
    setPendingLinkIds(currentLinks.map((l) => l.id));
    setIsDialogOpen(true);
  };

  const openAddDialog = () => {
    setEditingCategory(null);
    setFormData({ name: "", parentId: "", icon: "" });
    setPendingLinkIds([]);
    setIsDialogOpen(true);
  };

  const rootCategories = categories.filter((c) => !c.parentId);

  const stats = {
    totalLinks: categories.reduce((sum, c) => sum + (c._count?.links || 0), 0),
    totalCategories: categories.length,
    publicLinks: 0,
    privateLinks: 0,
  };

  const renderLinkPreview = (categoryId: string) => {
    const links = categoryLinks[categoryId] || [];
    if (links.length === 0) {
      return <span className="text-xs text-slate-400 italic">暂无链接</span>;
    }
    const displayLinks = links.slice(0, LINK_PREVIEW_COUNT);
    const remaining = links.length - LINK_PREVIEW_COUNT;
    return (
      <div className="flex items-center gap-1 overflow-hidden whitespace-nowrap">
        {displayLinks.map((link) => (
          <span
            key={link.id}
            className="inline-block max-w-[45%] truncate text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded shrink-0"
            title={link.title}
          >
            {link.title}
          </span>
        ))}
        {remaining > 0 && (
          <span className="text-xs text-blue-500 dark:text-blue-400 font-medium shrink-0">
            +{remaining}
          </span>
        )}
      </div>
    );
  };

  const renderCategoryRow = (category: Category, isChild = false) => {
    const links = categoryLinks[category.id] || [];
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
            ? "text-xs bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300 px-2 py-0.5 rounded"
            : "text-xs bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300 px-2 py-0.5 rounded"
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
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
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
              onClick={() => handleDelete(category.id)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
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
              <FolderOpen className="h-4 w-4 text-blue-500" />
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
                  <Label htmlFor="name">分类名称 <span className="text-red-500">*</span></Label>
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
                    <SelectTrigger className="mt-1">
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

                {/* 编辑时管理该分类下的链接 */}
                {editingCategory && (() => {
                  const allLinksFlat = Object.values(categoryLinks).flat().map((l) => ({
                    id: l.id,
                    title: l.title,
                    categoryId: l.categoryId,
                    createdAt: l.createdAt,
                  }));
                  return (
                    <div>
                      <Label className="mb-2 block">归属链接</Label>
                      <CategoryLinkManager
                        categoryId={editingCategory.id}
                        allLinks={allLinksFlat}
                        selectedIds={pendingLinkIds}
                        onSelectionChange={setPendingLinkIds}
                      />
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

          <div className="overflow-x-auto">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead style={{ width: "18%" }}>名称</TableHead>
                  <TableHead style={{ width: "10%" }}>类型</TableHead>
                  <TableHead style={{ width: "44%" }}>具体链接</TableHead>
                  <TableHead style={{ width: "10%" }} className="text-center">数量</TableHead>
                  <TableHead style={{ width: "18%" }} className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rootCategories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      没有分类，创建一个开始吧
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
      </div>
    </AdminLayout>
  );
}
