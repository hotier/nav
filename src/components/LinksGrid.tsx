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

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // 同步 links 到 localStorage，确保内联编辑后缓存不滞后
  useEffect(() => {
    try {
      localStorage.setItem("nav_links_cache", JSON.stringify(links));
    } catch { /* ignore */ }
  }, [links]);

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

      await fetch("/api/links/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
    } catch (error) {
      console.error("Failed to update sort order:", error);
    }
  };

  const handleUpdate = async (id: string, data: Partial<LinkType>) => {
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
          // 置顶切换后按规则重排序：置顶在前 → sortOrder 升序
          return next.sort((a, b) => {
            if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
            return a.sortOrder - b.sortOrder;
          });
        });
        toast.success("更新成功");
      } else {
        toast.error("更新失败");
      }
    } catch {
      toast.error("更新失败");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个链接吗？")) return;

    try {
      const response = await fetch(`/api/links/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setLinks((prev) => prev.filter((link) => link.id !== id));
        toast.success("删除成功");
      } else {
        toast.error("删除失败");
      }
    } catch {
      toast.error("删除失败");
    }
  };

  if (!isAdmin) {
    // Non-admin view - no drag and drop
    return (
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
    );
  }

  // Admin view - only render drag and drop after hydration to prevent mismatch
  if (!isHydrated) {
    return (
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
    );
  }

  return (
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
  );
}