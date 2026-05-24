"use client";

import React, { useState, useEffect, useCallback, Fragment } from "react";
import { useSession } from "next-auth/react";
import { Plus, Trash2, Edit, Folder, FolderOpen } from "lucide-react";
import { getCategoryIcon } from "@/lib/icons";
import { AdminLayout } from "@/components/AdminLayout";
import { IconPicker } from "@/components/IconPicker";
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
import type { Category } from "@/types";

function CategoryIcon({ icon, className }: { icon?: string | null; className?: string }) {
  return getCategoryIcon(icon, className || "h-4 w-4 text-muted-foreground");
}

export default function CategoriesPage() {
  const { data: session } = useSession();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    parentId: "",
    icon: "",
  });

  // 初始化：从 localStorage 加载缓存，实现即时渲染
  useEffect(() => {
    try {
      const cached = localStorage.getItem("nav_categories_cache");
      if (cached) setCategories(JSON.parse(cached));
    } catch { /* ignore */ }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch("/api/categories");
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
        try { localStorage.setItem("nav_categories_cache", JSON.stringify(data)); } catch { /* ignore */ }
      }
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("请输入分类名称");
      return;
    }

    setIsSubmitting(true);
    try {
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
        fetchCategories();
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

    try {
      const response = await fetch(`/api/categories/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("分类已删除");
        fetchCategories();
      } else {
        toast.error("删除失败");
      }
    } catch {
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
    setIsDialogOpen(true);
  };

  const openAddDialog = () => {
    setEditingCategory(null);
    setFormData({ name: "", parentId: "", icon: "" });
    setIsDialogOpen(true);
  };

  const rootCategories = categories.filter((c) => !c.parentId);

  const stats = {
    totalLinks: categories.reduce((sum, c) => sum + (c._count?.links || 0), 0),
    totalCategories: categories.length,
    publicLinks: 0,
    privateLinks: 0,
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
          <div className="hidden md:flex items-center gap-3 animate-fade-in-up delay-100">
            <div className="glass-effect rounded-full px-4 py-2 flex items-center gap-2">
              <Folder className="h-4 w-4 text-violet-500" />
              <span className="text-sm font-medium">{stats.totalCategories} 个分类</span>
            </div>
            <div className="glass-effect rounded-full px-4 py-2 flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">{stats.totalLinks} 个链接</span>
            </div>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openAddDialog}>
                <Plus className="h-4 w-4 mr-2" />
                添加分类
              </Button>
            </DialogTrigger>
            <DialogContent>
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
                <div className="flex justify-end gap-2">
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

          <div className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>链接数</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rootCategories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8">
                      没有分类，创建一个开始吧
                    </TableCell>
                  </TableRow>
                ) : (
                  rootCategories.map((category) => (
                    <Fragment key={category.id}>
                      <TableRow>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <CategoryIcon icon={category.icon} />
                            {category.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300 px-2 py-0.5 rounded">
                            父分类
                          </span>
                        </TableCell>
                        <TableCell>{category._count?.links || 0}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(category)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(category.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {category.children?.map((child) => (
                        <TableRow key={child.id}>
                          <TableCell className="font-medium pl-8">
                            <div className="flex items-center gap-2">
                              <CategoryIcon icon={child.icon} />
                              {child.name}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300 px-2 py-0.5 rounded">
                              子分类
                            </span>
                          </TableCell>
                          <TableCell>{child._count?.links || 0}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(child)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(child.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
