"use client";

import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ICON_NAMES, getAllIconNames, getCategoryIcon } from "@/lib/icons";

interface IconPickerProps {
  value: string;
  onChange: (iconName: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [allIconNames, setAllIconNames] = useState<string[]>([...ICON_NAMES]);

  // 弹窗打开后异步加载完整图标名列表
  useEffect(() => {
    if (open) {
      getAllIconNames().then(setAllIconNames);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return ICON_NAMES;
    const q = search.toLowerCase().replace(/[-_\s]/g, "");
    return allIconNames.filter((name) =>
      name.toLowerCase().replace(/[-_\s]/g, "").includes(q)
    );
  }, [search, allIconNames]);

  return (
    <div>
      <button
        type="button"
        className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => { setOpen(!open); setSearch(""); }}
      >
        <span className="mr-2">{getCategoryIcon(value || "Folder", "h-4 w-4")}</span>
        {value || "选择图标"}
      </button>
      {open && (
        <div className="mt-2 border rounded-md p-2 space-y-2 w-full">
          <Input
            placeholder="搜索图标…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
            autoFocus
          />
          <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
            {filtered.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => { onChange(name); setOpen(false); }}
                className={cn(
                  "flex items-center justify-center h-7 rounded hover:bg-accent transition-colors",
                  value === name && "bg-blue-100 dark:bg-blue-900/40 text-blue-600"
                )}
                title={name}
              >
                {getCategoryIcon(name, "h-4 w-4")}
              </button>
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              未找到匹配的图标
            </p>
          )}
          <div className="px-1 pt-1.5 border-t text-xs text-muted-foreground leading-relaxed">
            <span>💡 更多图标？去 </span>
            <a
              href="https://lucide.dev/icons"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-500 hover:underline"
            >
              lucide.dev/icons
            </a>
            <span> 复制名称后在此搜索</span>
          </div>
        </div>
      )}
    </div>
  );
}
