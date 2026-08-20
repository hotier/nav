"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LinkItem {
  id: string;
  title: string;
  categoryId: string;
  createdAt: string | Date;
}

interface CategoryLinkManagerProps {
  categoryId: string;
  allLinks: LinkItem[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function CategoryLinkManager({
  categoryId,
  allLinks,
  selectedIds,
  onSelectionChange,
}: CategoryLinkManagerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // 本地勾选集合
  const [checked, setChecked] = useState<Set<string>>(new Set(selectedIds));

  // 同步外部 selectedIds
  useEffect(() => {
    setChecked(new Set(selectedIds));
  }, [selectedIds]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggleLink = useCallback(
    (linkId: string) => {
      setChecked((prev) => {
        const next = new Set(prev);
        if (next.has(linkId)) {
          next.delete(linkId);
        } else {
          next.add(linkId);
        }
        onSelectionChange(Array.from(next));
        return next;
      });
    },
    [onSelectionChange]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allLinks;
    return allLinks.filter((l) => l.title.toLowerCase().includes(q));
  }, [search, allLinks]);

  const { inCategory, notInCategory } = useMemo(() => {
    const byTime = (a: LinkItem, b: LinkItem) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return {
      inCategory: filtered.filter((l) => l.categoryId === categoryId).sort(byTime),
      notInCategory: filtered.filter((l) => l.categoryId !== categoryId).sort(byTime),
    };
  }, [filtered, categoryId]);

  // 预览标签（当前分组链接按时间排序）
  const previewLinks = useMemo(() => {
    return allLinks
      .filter((l) => checked.has(l.id))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }, [allLinks, checked]);
  const PREVIEW_MAX = 3;
  const displayLinks = previewLinks.slice(0, PREVIEW_MAX);
  const remaining = previewLinks.length - PREVIEW_MAX;

  return (
    <div ref={containerRef} className="relative">
      {/* 触发器 */}
      <button
        type="button"
        className="flex items-center gap-1.5 min-h-[36px] w-full px-3 py-1.5 text-left rounded-lg border border-input bg-background hover:border-primary dark:hover:border-primary transition-colors"
        onClick={() => {
          setSearch("");
          setOpen((prev) => !prev);
        }}
      >
        {previewLinks.length === 0 ? (
          <span className="text-xs text-muted-foreground italic">选择链接…</span>
        ) : (
          <div className="flex flex-wrap items-center gap-1 overflow-hidden">
            {displayLinks.map((link) => (
              <span
                key={link.id}
                className="inline-block max-w-[80px] truncate text-xs bg-primary/10 dark:bg-primary/10 text-primary px-1.5 py-0.5 rounded"
                title={link.title}
              >
                {link.title}
              </span>
            ))}
            {remaining > 0 && (
              <span className="text-xs text-muted-foreground font-medium shrink-0">
                +{remaining}
              </span>
            )}
          </div>
        )}
      </button>

      {/* 下拉面板 */}
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-full min-w-[280px] border rounded-xl bg-card shadow-xl p-2 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索链接标题…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs pl-8 pr-3 rounded-lg"
              autoFocus
            />
          </div>
          <div className="max-h-[220px] overflow-y-auto space-y-0.5">
            {inCategory.map((link) => (
              <label
                key={link.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer"
              >
                <Checkbox
                  checked={checked.has(link.id)}
                  onCheckedChange={() => toggleLink(link.id)}
                  className="h-3.5 w-3.5 shrink-0"
                />
                <span className={cn(
                  "text-xs truncate",
                  !checked.has(link.id) && "opacity-50"
                )}>
                  {link.title}
                </span>
              </label>
            ))}
            {notInCategory.map((link) => (
              <label
                key={link.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer"
              >
                <Checkbox
                  checked={checked.has(link.id)}
                  onCheckedChange={() => toggleLink(link.id)}
                  className="h-3.5 w-3.5 shrink-0"
                />
                <span className={cn(
                  "text-xs truncate",
                  !checked.has(link.id) && "opacity-50"
                )}>
                  {link.title}
                </span>
              </label>
            ))}
            {inCategory.length === 0 && notInCategory.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                未找到匹配的链接
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
