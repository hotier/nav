"use client";

import { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { LinkCard } from "@/components/LinkCard";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { notifyDataChanged } from "@/lib/cache-client";
import type { Category, Link as LinkType } from "@/types";
import toast from "react-hot-toast";

interface LinksGridProps {
  links: LinkType[];
  categories: Category[];
  isAdmin: boolean;
  searchQuery?: string;
}

export function LinksGrid({ links: initialLinks, categories, isAdmin, searchQuery }: LinksGridProps) {
  const [links, setLinks] = useState(initialLinks);
  const [isHydrated, setIsHydrated] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // 父级数据变化（如分页加载、刷新）时同步到内部 state
  useEffect(() => {
    setLinks(initialLinks);
  }, [initialLinks]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setLinks((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);

        // Update sort order in background
        handleReorder(newItems);

        return newItems;
      });
    }
  };

  const handleReorder = async ( reorderedLinks: LinkType[] ) => {
    try {
      // 保持置顶/非置顶分组：置顶项 sortOrder 从 0 开始，非置顶从置顶数量后开始
      let pinnedIndex = 0;
      const pinnedCount = reorderedLinks.filter((l) => l.isPinned).length;
      let unpinnedIndex = pinnedCount;
      const updates = reorderedLinks.map((link) => ({
        id: link.id,
        sortOrder: link.isPinned ? pinnedIndex++ : unpinnedIndex++,
      }));

      const res = await fetch("/api/links/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (res.ok) {
        // 广播数据变更，让其他已打开的链接页面实时刷新
        notifyDataChanged("Link");
      }
    } catch (error) {
      console.error("Failed to update sort order:", error);
    }
  };

  const handleUpdate = async (id: string, data: Partial<LinkType>, silent?: boolean) => {
    const prevLinks = links;
    // 乐观更新 UI（策略4：先更新本地缓存+视图，页面瞬时响应）
    setLinks((prev) =>
      prev
        .map((l) => (l.id === id ? { ...l, ...data } : l))
        .sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        })
    );
    try {
      const response = await fetch(`/api/links/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const updated = await response.json();
        setLinks((prev) => {
          const next = prev.map((link) => (link.id === id ? { ...link, ...updated } : link));
          // 置顶切换后按规则重排序（最新在前）
          return next.sort((a, b) => {
            if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });
        });
        if (!silent) toast.success("更新成功");
        // 广播数据变更，让其他已打开的链接页面实时刷新
        notifyDataChanged("Link");
      } else {
        // 回滚
        setLinks(prevLinks);
        toast.error("更新失败");
      }
    } catch {
      setLinks(prevLinks);
      toast.error("更新失败");
    }
  };

  const handleDelete = (id: string) => {
    setDeleteTargetId(id);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    setIsDeleting(true);

    const prevLinks = links;
    // 乐观删除（策略4：先更新视图，页面瞬时响应）
    setLinks((prev) => prev.filter((link) => link.id !== id));

    try {
      const response = await fetch(`/api/links/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("删除成功");
        // 广播数据变更，让其他已打开的链接页面实时刷新
        notifyDataChanged("Link");
      } else {
        // 回滚
        setLinks(prevLinks);
        toast.error("删除失败");
      }
    } catch {
      setLinks(prevLinks);
      toast.error("删除失败");
    } finally {
      setIsDeleting(false);
      setDeleteTargetId(null);
    }
  };

  if (!isAdmin) {
    // Non-admin view - no drag and drop
    return (
      <>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 animate-fade-in-up delay-100">
          {links.map((link) => (
            <LinkCard
              key={link.id}
              link={link}
              categories={categories}
              isAdmin={false}
              searchQuery={searchQuery}
            />
          ))}
        </div>
        <ConfirmDialog
          open={!!deleteTargetId}
          onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
          title="删除链接"
          description={
            <p>确定要删除这个链接吗？<span className="mt-2 block text-danger text-sm">此操作不可撤销。</span></p>
          }
          confirmLabel="确认删除"
          onConfirm={handleConfirmDelete}
          loading={isDeleting}
        />
      </>
    );
  }

  // Admin view - only render drag and drop after hydration to prevent mismatch
  if (!isHydrated) {
    return (
      <>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 animate-fade-in-up delay-100">
          {links.map((link) => (
            <LinkCard
              key={link.id}
              link={link}
              categories={categories}
              isAdmin={isAdmin}
              searchQuery={searchQuery}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              isDraggable={false}
            />
          ))}
        </div>
        <ConfirmDialog
          open={!!deleteTargetId}
          onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
          title="删除链接"
          description={
            <p>确定要删除这个链接吗？<span className="mt-2 block text-danger text-sm">此操作不可撤销。</span></p>
          }
          confirmLabel="确认删除"
          onConfirm={handleConfirmDelete}
          loading={isDeleting}
        />
      </>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={links} strategy={rectSortingStrategy}>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 animate-fade-in-up delay-100">
            {links.map((link) => (
              <LinkCard
                key={link.id}
                link={link}
                categories={categories}
                isAdmin={isAdmin}
                searchQuery={searchQuery}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                isDraggable={true}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <ConfirmDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
        title="删除链接"
        description={
          <p>确定要删除这个链接吗？<span className="mt-2 block text-red-500 text-sm">此操作不可撤销。</span></p>
        }
        confirmLabel="确认删除"
        onConfirm={handleConfirmDelete}
        loading={isDeleting}
      />
    </>
  );
}