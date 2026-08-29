"use client";

import React, { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { Plus, Trash2, Edit, PencilOff, Folder, FolderOpen, Loader2, Globe, GlobeOff, EyeOff, Lock, ChevronDown, Check, AlertTriangle, User, UserRoundPen, Users } from "lucide-react";
import { DynamicIcon } from "@/components/DynamicIcon";
import { AdminLayout } from "@/components/AdminLayout";
import { IconPicker } from "@/components/IconPicker";
import { notifyDataChanged } from "@/lib/cache-client";
import { categoryNameSchema } from "@/lib/validators";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import type { Category, Link as LinkType } from "@/types";
import { useDataCache } from "@/hooks/useDataCache";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import TruncatedText from "@/components/TruncatedText";

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
  const { data: cacheData, loading, syncing: _syncing, setData } = useDataCache({
    configs: [
    { name: "Category:mgmt:v3", versionTable: "Category", fetch: () => fetch("/api/categories?scope=manage").then(r => r.json()).then(d => ({ data: d, total: d.length })) },
  ], userId: uid });

  // Link 数据 — 与首页/链接管理页共用同一套数据源（name/pageSize/fetch 一致 → 同一缓存、同一版本号）：
  // 数据范围 = home 可见性（自己的全部含私有 + 他人公开），普通用户在渲染层过滤出"仅自己的"。
  const { items: allLinks, isLoadingMore, sentinelRef, setItems: setLinkData } = useInfiniteScroll<LinkType>({
    name: "Link:v2",
    versionTable: "Link",
    userId: uid,
    pageSize: 1000,
    fetchFn: (page, pageSize) =>
      fetch(`/api/links?page=${page}&pageSize=${pageSize}&sort=recent`)
        .then(r => r.json())
        .then((d: { data: LinkType[]; total: number }) => ({ data: d.data, total: d.total })),
  });

  const categories = (cacheData["Category:mgmt:v3"] || []) as Category[];

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
    isPublic: true,
  });

  // 分类名称行内校验错误（输入框下方提示）
  const [nameError, setNameError] = useState<string | null>(null);

  // 可见性筛选
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "public" | "private">("all");

  // 创建人筛选：全部 / 归我所有 / 与我共享
  const [creatorFilter, setCreatorFilter] = useState<"all" | "mine" | "shared">("all");

  // 父分类下拉（弹窗内，样式与链接管理页一致）
  const [parentMenuOpen, setParentMenuOpen] = useState(false);
  const parentBtnRef = useRef<HTMLButtonElement>(null);
  const parentMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!parentMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (parentMenuRef.current && !parentMenuRef.current.contains(e.target as Node)) {
        setParentMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [parentMenuOpen]);

  // 移动全部链接目标分类下拉
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const moveBtnRef = useRef<HTMLButtonElement>(null);
  const moveMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moveMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (moveMenuRef.current && !moveMenuRef.current.contains(e.target as Node)) {
        setMoveMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moveMenuOpen]);

  // 逐行可见性切换
  const [categoryUpdating, setCategoryUpdating] = useState<Record<string, boolean>>({});

  // 隐藏确认框：管理员将他人的公开分类设为隐藏前需二次确认
  const [hideConfirmCategoryId, setHideConfirmCategoryId] = useState<string | null>(null);

  // 执行可见性变更：公开/私有（普通用户与属主）；隐藏/解除隐藏（仅管理员对他人的公开分类）
  // target 支持 { isPublic?: boolean; isHidden?: boolean }
  const performSetVisibility = async (categoryId: string, target: { isPublic?: boolean; isHidden?: boolean }) => {
    const prevCategories = [...categories];
    // 乐观更新
    setData("Category:mgmt:v3", (prev) =>
      (prev as Category[]).map((c) =>
        c.id === categoryId
          ? {
              ...c,
              ...(target.isPublic !== undefined ? { isPublic: target.isPublic } : {}),
              ...(target.isHidden !== undefined ? { isHidden: target.isHidden } : {}),
            }
          : c
      )
    );
    setCategoryUpdating((prev) => ({ ...prev, [categoryId]: true }));
    try {
      const res = await fetch(`/api/categories/${categoryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
      if (res.ok) {
        const updated = await res.json();
        setData("Category:mgmt:v3", (prev) =>
          (prev as Category[]).map((c) =>
            c.id === categoryId ? { ...c, isPublic: updated.isPublic, isHidden: updated.isHidden } : c
          )
        );
        if (updated.isHidden) toast.success("已隐藏");
        else if (updated.isPublic) toast.success("已设为公开");
        else toast.success("已设为私有");
        notifyDataChanged("Category");
        notifyDataChanged("Link");
        refreshLinks();
      } else {
        setData("Category:mgmt:v3", () => prevCategories);
        const err = await res.json();
        toast.error(err.error || "操作失败");
      }
    } catch {
      setData("Category:mgmt:v3", () => prevCategories);
      toast.error("操作失败");
    } finally {
      setCategoryUpdating((prev) => ({ ...prev, [categoryId]: false }));
    }
  };

  // 可见性操作入口：设置为隐藏时先弹确认框
  const handleSetVisibility = async (categoryId: string, target: { isPublic?: boolean; isHidden?: boolean }) => {
    if (target.isHidden) {
      setHideConfirmCategoryId(categoryId);
      return;
    }
    await performSetVisibility(categoryId, target);
  };

  // 隐藏确认框目标分类的所有者用户名
  const hideConfirmCategoryUser = hideConfirmCategoryId
    ? categories.find((c) => c.id === hideConfirmCategoryId)?.user
    : undefined;

  // 可见性菜单选项（与后端 PUT /api/categories/[id] 权限一致）
  // - 隐藏内容：仅管理员可解除为公开
  // - 自己的分类：公开/私有自由切换
  // - 管理员的他人公开分类：公开（当前）/ 隐藏
  const categoryVisibilityOptions = (category: Category) => {
    if (category.isHidden) {
      if (!isAdmin) return [];
      return [{ label: "公开", Icon: Globe, color: "text-success", active: false, payload: { isPublic: true, isHidden: false } as const }];
    }
    if (category.userId === uid) {
      return [
        { label: "公开", Icon: Globe, color: "text-success", active: category.isPublic, payload: { isPublic: true } as const },
        { label: "私有", Icon: EyeOff, color: "text-warning", active: !category.isPublic, payload: { isPublic: false } as const },
      ];
    }
    if (isAdmin && category.isPublic) {
      return [
        { label: "公开", Icon: Globe, color: "text-success", active: true, payload: { isPublic: true } as const },
        { label: "隐藏", Icon: GlobeOff, color: "text-warning", active: false, payload: { isHidden: true } as const },
      ];
    }
    return [];
  };

  // CRUD 后手动刷新数据
  const refreshCategories = async () => {
    try {
      const res = await fetch("/api/categories?scope=manage");
      if (res.ok) {
        const data = await res.json();
        setData("Category:mgmt:v3", () => data);
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

    // 分类名称校验：允许任意输入，提交时按具体规则提示错误（与后端 categoryNameSchema 一致）
    const nameResult = categoryNameSchema.safeParse(formData.name);
    if (!nameResult.success) {
      setNameError(nameResult.error.issues[0]?.message || "分类名称不符合规则");
      return;
    }
    const name = nameResult.data;

    // 公开分类名称全局唯一：提交前快速拦截（后端同样校验兜底）
    if (categoryNameConflict) {
      setNameError("已存在同名公开分类，请修改分类命名后重试");
      return;
    }

    setIsSubmitting(true);
    const isEdit = !!editingCategory;
    const editingId = editingCategory?.id;
    const prevCategories = [...categories];
    let tempId: string | null = null;

    // 乐观更新：立即在列表中应用创建/编辑结果，请求失败再回滚
    if (isEdit) {
      setData("Category:mgmt:v3", (prev) =>
        (prev as Category[]).map((c) =>
          c.id === editingId
            ? {
                ...c,
                name,
                icon: formData.icon || null,
                parentId: formData.parentId || null,
                isPublic: formData.isPublic,
              }
            : c
        )
      );
    } else {
      tempId = `temp_${Date.now()}`;
      const optimistic: Category = {
        id: tempId,
        slug: null,
        name,
        icon: formData.icon || null,
        parentId: formData.parentId || null,
        isPublic: formData.isPublic,
        isHidden: false,
        userId: uid || null,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { links: 0 },
        user: {
          id: uid || "",
          name: session?.user?.name || null,
          username: null,
          image: session?.user?.image || null,
        },
      };
      setData("Category:mgmt:v3", (prev) => [optimistic, ...(prev as Category[])]);
    }

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
          name, // 已由 categoryNameSchema 完成 trim
          icon: formData.icon || null,
          parentId: formData.parentId || null,
          isPublic: formData.isPublic,
        }),
      });

      if (response.ok) {
        const saved = await response.json();
        // 用服务端返回的真实数据校正（编辑按 id 合并、创建将 tempId 替换为真实 id）
        setData("Category:mgmt:v3", (prev) =>
          (prev as Category[]).map((c) =>
            c.id === (isEdit ? editingId : tempId) ? saved : c
          )
        );
        toast.success(editingCategory ? "分类已更新" : "分类已创建");
        setIsDialogOpen(false);
        setEditingCategory(null);
        setFormData({ name: "", parentId: "", icon: "", isPublic: true });
        setMoveTargetCategoryId("");
        setNameError(null);
        // 广播：分类变更（含编辑弹窗里的 isPublic 开关）影响链接可见范围，
        // 可能已批量移动链接 → 双发，让首页/分类页等已打开页面实时刷新
        notifyDataChanged("Category");
        notifyDataChanged("Link");
        await Promise.all([refreshCategories(), refreshLinks()]);
      } else {
        // 回滚
        setData("Category:mgmt:v3", () => prevCategories);
        const error = await response.json();
        toast.error(error.error || "操作失败");
      }
    } catch {
      // 回滚
      setData("Category:mgmt:v3", () => prevCategories);
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
    setData("Category:mgmt:v3", (prev) => (prev as Category[]).filter((c) => c.id !== target.id));
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
        setData("Category:mgmt:v3", () => prevCategories);
        const err = await response.json();
        toast.error(err.error || "删除失败");
      }
    } catch {
      setData("Category:mgmt:v3", () => prevCategories);
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
    setNameError(null);
    setIsDialogOpen(true);
  };

  const openAddDialog = () => {
    setEditingCategory(null);
    setFormData({ name: "", parentId: "", icon: "", isPublic: true });
    setMoveTargetCategoryId("");
    setNameError(null);
    setIsDialogOpen(true);
  };

  // 可见性 + 创建人 组合筛选（作用于整棵树，子分类过滤后独立展示）
  const filteredCategories = useMemo(() => {
    return categories.filter((c) => {
      const matchVis =
        visibilityFilter === "all" ||
        (visibilityFilter === "public" && c.isPublic) ||
        (visibilityFilter === "private" && !c.isPublic);
      const matchCreator =
        creatorFilter === "all" ||
        (creatorFilter === "mine" && c.userId === uid) ||
        (creatorFilter === "shared" && c.userId !== uid);
      return matchVis && matchCreator;
    });
  }, [categories, visibilityFilter, creatorFilter, uid]);

  // 实时重名提示：公开分类名称全局唯一（公开与私有之间可重名），编辑时排除自身
  const categoryNameConflict = useMemo(() => {
    const trimmed = formData.name.trim();
    if (!trimmed || !formData.isPublic) return false;
    return categories.some(
      (c) =>
        c.id !== editingCategory?.id &&
        !c.id.startsWith("temp_") && // 排除乐观更新的临时项，避免新建瞬间自己与自己冲突
        c.isPublic &&
        c.name.trim() === trimmed
    );
  }, [formData.name, formData.isPublic, categories, editingCategory?.id]);

  const rootCategories = categories.filter((c) => !c.parentId);
  const filteredRoots = filteredCategories.filter((c) => !c.parentId);
  const filteredChildren = filteredCategories.filter((c) => c.parentId);

  // 根据最长分类名称计算下拉菜单宽度（与链接管理页一致）
  const categoryDropdownMinW = useMemo(() => {
    const maxLen = categories.reduce((m, c) => Math.max(m, c.name.length), 0);
    return Math.max(180, maxLen * 16 + 120);
  }, [categories]);

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
          <TruncatedText
            key={link.id}
            text={link.title}
            className="!max-w-[45%] shrink-0 text-xs bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground px-1.5 py-0.5 rounded"
          >
            {link.title}
          </TruncatedText>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={categoryUpdating[category.id]}
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ring-1 outline-none focus-visible:outline-none focus-visible:ring-0",
                    category.isHidden
                      ? "bg-muted text-muted-foreground ring-border hover:bg-muted/60"
                      : category.isPublic
                        ? "bg-success-muted text-success-muted-foreground ring-success/20 hover:bg-success-muted/60"
                        : "bg-warning-muted text-warning-muted-foreground ring-warning/20 hover:bg-warning-muted/60"
                  )}
                >
                  {categoryUpdating[category.id] ? (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  ) : category.isHidden ? (
                    <GlobeOff className="h-3 w-3 text-warning" />
                  ) : category.isPublic ? (
                    <Globe className="h-3 w-3 text-success" />
                  ) : (
                    <EyeOff className="h-3 w-3 text-warning" />
                  )}
                  {category.isHidden ? "隐藏" : category.isPublic ? "公开" : "私有"}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="center"
                sideOffset={4}
                className="min-w-[120px] rounded-lg bg-card p-0 py-1 border-border"
              >
                {categoryVisibilityOptions(category).map(({ label, Icon, color, active, payload }) => (
                  <DropdownMenuItem
                    key={label}
                    onClick={() => handleSetVisibility(category.id, payload)}
                    disabled={categoryUpdating[category.id]}
                    className={cn(
                      "px-3 py-2 text-xs cursor-pointer rounded-none",
                      active ? "text-foreground font-medium" : "text-muted-foreground"
                    )}
                  >
                    <Icon className={cn("h-3.5 w-3.5", color)} />
                    <span className="flex-1 text-left">{label}</span>
                    {active && <Check className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className={cn(
              "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ring-1",
              category.isHidden
                ? "bg-muted text-muted-foreground ring-border"
                : category.isPublic
                  ? "bg-success-muted text-success-muted-foreground ring-success/20"
                  : "bg-warning-muted text-warning-muted-foreground ring-warning/20"
            )}>
              {category.isHidden ? (
                <>
                  <GlobeOff className="h-3 w-3 text-warning" />
                  隐藏
                </>
              ) : category.isPublic ? (
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
            <TruncatedText
              text={category.user.name || category.user.username || ""}
              className="text-muted-foreground !max-w-[120px]"
            >
              {category.user.name || category.user.username || "未知"}
            </TruncatedText>
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
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled
                title="只读"
                aria-label="只读"
              >
                <PencilOff className="h-4 w-4" />
              </Button>
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
            <DialogContent
              className="sm:max-w-lg"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
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
                    onChange={(e) => {
                      const value = e.target.value;
                      setFormData({
                        ...formData,
                        name: value, // 允许任意输入，输入时动态校验并提示具体错误
                      });
                      // 动态校验：非空时实时提示超长/非法字符；空值留到提交时再提示
                      if (value.trim() === "") {
                        setNameError(null);
                        return;
                      }
                      const result = categoryNameSchema.safeParse(value);
                      setNameError(
                        result.success
                          ? null
                          : result.error.issues[0]?.message || "分类名称不符合规则"
                      );
                    }}
                    placeholder="分类名称"
                    className="mt-1"
                  />
                  {nameError && (
                    <p className="flex items-center gap-1 text-xs text-danger mt-1">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {nameError}
                    </p>
                  )}
                  {!nameError && categoryNameConflict && (
                    <p className="flex items-center gap-1 text-xs text-danger mt-1">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      已存在同名公开分类，请修改分类命名后重试
                    </p>
                  )}
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
                  <div className="relative mt-1">
                    <button
                      ref={parentBtnRef}
                      type="button"
                      onClick={() => setParentMenuOpen((prev) => !prev)}
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="flex items-center gap-2 overflow-hidden">
                        {formData.parentId ? (
                          <>
                            <DynamicIcon name={categories.find((c) => c.id === formData.parentId)?.icon || "Folder"} className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate">{categories.find((c) => c.id === formData.parentId)?.name || ""}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">无（顶级分类）</span>
                        )}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </button>
                    {parentMenuOpen && createPortal(
                      <div
                        ref={parentMenuRef}
                        style={{
                          position: "fixed",
                          top: (parentBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                          left: (parentBtnRef.current?.getBoundingClientRect().left ?? 0),
                          minWidth: `${categoryDropdownMinW}px`,
                        }}
                        className="z-[9999] max-h-[240px] overflow-y-auto rounded-lg border border-border bg-card shadow-lg py-1"
                      >
                        <button
                          type="button"
                          onClick={() => { setFormData({ ...formData, parentId: "" }); setParentMenuOpen(false); }}
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-muted",
                            !formData.parentId ? "text-foreground font-medium" : "text-muted-foreground"
                          )}
                        >
                          <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="flex-1 text-left">无（顶级分类）</span>
                          {!formData.parentId && <Check className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />}
                        </button>
                        {rootCategories
                          .filter((c) => c.id !== editingCategory?.id)
                          .map((cat) => (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => { setFormData({ ...formData, parentId: cat.id }); setParentMenuOpen(false); }}
                              className={cn(
                                "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-muted",
                                formData.parentId === cat.id ? "text-foreground font-medium" : "text-muted-foreground"
                              )}
                            >
                              <DynamicIcon name={cat.icon || "Folder"} className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="flex-1 text-left truncate">{cat.name}</span>
                              {cat.isPublic ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-px rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 flex-shrink-0">
                                  <Globe className="h-2.5 w-2.5" />
                                  公开
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-px rounded-full bg-warning-muted text-warning-muted-foreground flex-shrink-0">
                                  <Lock className="h-2.5 w-2.5" />
                                  私有
                                </span>
                              )}
                              <span className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center">
                                {formData.parentId === cat.id && <Check className="h-3.5 w-3.5 text-violet-500" />}
                              </span>
                            </button>
                          ))}
                      </div>,
                      document.body
                    )}
                  </div>
                </div>

                {/* 公开/私有开关 */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label
                      htmlFor="isPublic"
                      className={cn(
                        "inline-flex items-center gap-1.5 transition-colors",
                        formData.isPublic ? "text-success" : "text-warning"
                      )}
                    >
                      {formData.isPublic ? (
                        <Globe className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                      )}
                      {formData.isPublic ? "公开分类" : "私有分类"}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formData.isPublic
                        ? "公开后所有用户可见，关闭后仅自己可见"
                        : "仅自己可见，开启后所有用户可见"}
                    </p>
                  </div>
                  <Switch
                    id="isPublic"
                    checked={formData.isPublic}
                    onCheckedChange={(checked) => setFormData({ ...formData, isPublic: checked })}
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
                        <div className="relative">
                          <button
                            ref={moveBtnRef}
                            type="button"
                            onClick={() => setMoveMenuOpen((prev) => !prev)}
                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span className="flex items-center gap-2 overflow-hidden">
                              {moveTargetCategoryId && moveTargetCategoryId !== "_keep" ? (
                                <>
                                  <DynamicIcon name={otherCategories.find((c) => c.id === moveTargetCategoryId)?.icon || "Folder"} className="h-4 w-4 text-muted-foreground shrink-0" />
                                  <span className="truncate">{otherCategories.find((c) => c.id === moveTargetCategoryId)?.name || ""}</span>
                                </>
                              ) : (
                                <span className="text-muted-foreground">保持当前分类（不移动）</span>
                              )}
                            </span>
                            <ChevronDown className="h-4 w-4 opacity-50" />
                          </button>
                          {moveMenuOpen && createPortal(
                            <div
                              ref={moveMenuRef}
                              style={{
                                position: "fixed",
                                top: (moveBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                                left: (moveBtnRef.current?.getBoundingClientRect().left ?? 0),
                                minWidth: `${categoryDropdownMinW}px`,
                              }}
                              className="z-[9999] max-h-[240px] overflow-y-auto rounded-lg border border-border bg-card shadow-lg py-1"
                            >
                              <button
                                type="button"
                                onClick={() => { setMoveTargetCategoryId("_keep"); setMoveMenuOpen(false); }}
                                className={cn(
                                  "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-muted",
                                  !moveTargetCategoryId || moveTargetCategoryId === "_keep" ? "text-foreground font-medium" : "text-muted-foreground"
                                )}
                              >
                                <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="flex-1 text-left">保持当前分类（不移动）</span>
                                {(!moveTargetCategoryId || moveTargetCategoryId === "_keep") && <Check className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />}
                              </button>
                              {otherCategories.map((cat) => (
                                <button
                                  key={cat.id}
                                  type="button"
                                  onClick={() => { setMoveTargetCategoryId(cat.id); setMoveMenuOpen(false); }}
                                  className={cn(
                                    "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-muted",
                                    moveTargetCategoryId === cat.id ? "text-foreground font-medium" : "text-muted-foreground"
                                  )}
                                >
                                  <DynamicIcon name={cat.icon || "Folder"} className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="flex-1 text-left truncate">{cat.name}</span>
                                  {cat.isPublic ? (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-px rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 flex-shrink-0">
                                      <Globe className="h-2.5 w-2.5" />
                                      公开
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-px rounded-full bg-warning-muted text-warning-muted-foreground flex-shrink-0">
                                      <Lock className="h-2.5 w-2.5" />
                                      私有
                                    </span>
                                  )}
                                  <span className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center">
                                    {moveTargetCategoryId === cat.id && <Check className="h-3.5 w-3.5 text-violet-500" />}
                                  </span>
                                </button>
                              ))}
                            </div>,
                            document.body
                          )}
                        </div>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
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
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="center"
                sideOffset={4}
                className="min-w-[120px] rounded-lg bg-card p-0 py-1 border-border"
              >
                {([
                  { value: "all", label: "全部", Icon: Globe, color: "text-muted-foreground" },
                  { value: "public", label: "公开", Icon: Globe, color: "text-success" },
                  { value: "private", label: "私有", Icon: EyeOff, color: "text-warning" },
                ] as const).map(({ value, label, Icon, color }) => (
                  <DropdownMenuItem
                    key={value}
                    onClick={() => setVisibilityFilter(value)}
                    className={cn(
                      "px-3 py-2 text-xs cursor-pointer rounded-none",
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
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Creator Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-muted text-muted-foreground ring-1 ring-border hover:bg-accent dark:bg-muted dark:text-muted-foreground dark:ring-border dark:hover:bg-accent transition-all cursor-pointer h-9"
                >
                  {creatorFilter === "mine" ? (
                    <UserRoundPen className="h-3.5 w-3.5 text-success" />
                  ) : creatorFilter === "shared" ? (
                    <Users className="h-3.5 w-3.5 text-warning" />
                  ) : (
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  {creatorFilter === "mine"
                    ? "归我所有"
                    : creatorFilter === "shared"
                      ? "与我共享"
                      : "创建人"}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="center"
                sideOffset={4}
                className="min-w-[140px] rounded-lg bg-card p-0 py-1 border-border"
              >
                <DropdownMenuItem
                  onClick={() => setCreatorFilter("all")}
                  className={cn(
                    "px-3 py-2 text-xs cursor-pointer rounded-none",
                    creatorFilter === "all" ? "text-foreground font-medium" : "text-muted-foreground"
                  )}
                >
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1 text-left">全部</span>
                  {creatorFilter === "all" && <Check className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setCreatorFilter("mine")}
                  className={cn(
                    "px-3 py-2 text-xs cursor-pointer rounded-none",
                    creatorFilter === "mine" ? "text-foreground font-medium" : "text-muted-foreground"
                  )}
                >
                  <UserRoundPen className="h-3.5 w-3.5 text-success" />
                  <span className="flex-1 text-left">归我所有</span>
                  {creatorFilter === "mine" && <Check className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setCreatorFilter("shared")}
                  className={cn(
                    "px-3 py-2 text-xs cursor-pointer rounded-none",
                    creatorFilter === "shared" ? "text-foreground font-medium" : "text-muted-foreground"
                  )}
                >
                  <Users className="h-3.5 w-3.5 text-warning" />
                  <span className="flex-1 text-left">与我共享</span>
                  {creatorFilter === "shared" && <Check className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
                {loading && filteredRoots.length === 0 ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i} className="hover:bg-transparent">
                      <TableCell style={{ width: "14%" }}>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell style={{ width: "7%" }}>
                        <Skeleton className="h-4 w-8" />
                      </TableCell>
                      <TableCell style={{ width: "28%" }}>
                        <Skeleton className="h-4 w-48" />
                      </TableCell>
                      <TableCell style={{ width: "7%" }} className="text-center">
                        <Skeleton className="h-4 w-6 mx-auto" />
                      </TableCell>
                      <TableCell style={{ width: "12%" }}>
                        <Skeleton className="h-4 w-12" />
                      </TableCell>
                      <TableCell style={{ width: "14%" }}>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                      <TableCell style={{ width: "18%" }} className="text-right">
                        <Skeleton className="h-7 w-7 ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filteredRoots.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8">
                      <Empty>
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <Folder className="size-5" />
                          </EmptyMedia>
                          <EmptyTitle>
                            {categories.length === 0 ? "没有分类" : "没有符合条件的分类"}
                          </EmptyTitle>
                          <EmptyDescription>
                            {categories.length === 0
                              ? "创建一个分类开始整理你的书签吧"
                              : "试试调整上方的筛选条件"}
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRoots.map((category) => (
                    <Fragment key={category.id}>
                      {renderCategoryRow(category, false)}
                      {filteredChildren
                        .filter((child) => child.parentId === category.id)
                        .map((child) => (
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

      {/* 隐藏确认框：转为隐藏后普通用户不可再修改可见性 */}
      <ConfirmDialog
        open={!!hideConfirmCategoryId}
        onOpenChange={(open) => {
          if (!open) setHideConfirmCategoryId(null);
        }}
        title="确认隐藏该分类？"
        description={
          <p>
            转为隐藏后，用户「{hideConfirmCategoryUser?.name || hideConfirmCategoryUser?.username || "未知"}」将
            <strong className="text-danger">无法修改</strong>
            该分类的可见性。
          </p>
        }
        confirmText="确认隐藏"
        onConfirm={() => {
          const id = hideConfirmCategoryId;
          setHideConfirmCategoryId(null);
          if (id) performSetVisibility(id, { isHidden: true });
        }}
      />
    </AdminLayout>
  );
}
