"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ICON_NAMES, getAllIconNames } from "@/lib/icons";
import { DynamicIcon } from "@/components/DynamicIcon";

interface IconPickerProps {
  value: string;
  onChange: (iconName: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [allIconNames, setAllIconNames] = useState<string[]>([...ICON_NAMES]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      getAllIconNames().then(setAllIconNames);
    }
  }, [open]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = useMemo(() => {
    const list = search.trim() ? allIconNames : ICON_NAMES;
    if (!search.trim()) return list;
    const q = search.toLowerCase().replace(/[-_\s]/g, "");
    return list.filter((name) =>
      name.toLowerCase().replace(/[-_\s]/g, "").includes(q)
    );
  }, [search, allIconNames]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground"
        onClick={() => { setOpen(!open); setSearch(""); }}
      >
        <span className="mr-2"><DynamicIcon name={value || "Folder"} className="h-4 w-4" /></span>
        {value || <span className="text-muted-foreground">选择图标…</span>}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-72 border rounded-xl bg-popover shadow-xl p-2 space-y-2">
          <Input
            placeholder="搜索图标…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm rounded-lg"
            autoFocus
          />
          <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto p-1">
            {filtered.map((name) => (
              <button
                key={name}
                type="button"
                onClick={(e) => { e.stopPropagation(); onChange(name); setOpen(false); }}
                className={cn(
                  "flex items-center justify-center h-8 rounded-lg hover:bg-accent transition-colors",
                  value === name && "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
                )}
                title={name}
              >
                <DynamicIcon name={name} className="h-4 w-4" />
              </button>
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              未找到匹配的图标
            </p>
          )}
          <div className="px-2 pt-1.5 border-t text-xs text-muted-foreground leading-relaxed">
            <span>去 </span>
            <a
              href="https://lucide.dev/icons"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-500 hover:underline"
            >
              lucide.dev/icons
            </a>
            <span> 查找更多图标名称</span>
          </div>
        </div>
      )}
    </div>
  );
}
