"use client";

import React, { useState, useRef, useEffect } from "react";
import { Upload, Download, FileJson, FileCode } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { readPageCache, writePageCache, getServerVersion } from "@/lib/cache-client";

interface Category {
  id: string;
  name: string;
}

export default function ImportExportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [importFormat, setImportFormat] = useState<"html" | "json">("html");
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // 初始化：从缓存预加载分类列表
  useEffect(() => {
    const cached = readPageCache<Category>("Category", 1);
    if (cached && cached.data.length > 0) setCategories(cached.data);
  }, []);

  // Fetch categories on mount and after import
  const fetchCategories = async () => {
    try {
      const [res, serverVersion] = await Promise.all([
        fetch("/api/categories"),
        getServerVersion("Category"),
      ]);
      if (res.ok) {
        const data: Category[] = await res.json();
        setCategories(data);
        writePageCache("Category", 1, data, data.length, serverVersion || 1);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleFileUpload = async (file: File) => {
    const text = await file.text();

    setIsImporting(true);
    try {
      const response = await fetch("/api/import-export/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: text,
          format: importFormat,
          categoryId: selectedCategory || undefined,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        toast.success(result.message || "导入成功");
        fetchCategories();
        router.refresh();
      } else {
        toast.error(result.error || "导入失败");
      }
    } catch {
      toast.error("导入失败");
    } finally {
      setIsImporting(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      params.set("format", "json");

      const response = await fetch(`/api/import-export/export?${params}`);

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `onenav-export-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("导出成功");
      } else {
        toast.error("导出失败");
      }
    } catch {
      toast.error("导出失败");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      const format = file.name.endsWith(".json") ? "json" : "html";
      setImportFormat(format);
      handleFileUpload(file);
    }
  };

  const stats = {
    totalLinks: 0,
    totalCategories: categories.length,
    publicLinks: 0,
    privateLinks: 0,
  };

  return (
    <AdminLayout stats={stats}>
      <div className="dashboard-container space-y-8">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-space-grotesk)" }}>导入导出</h1>
          <p className="text-muted-foreground">
            导入浏览器书签或导出为标准格式
          </p>
        </div>

        {/* Stats Cards */}
        <div className="hidden md:flex items-center gap-3 animate-fade-in-up delay-200">
          <div className="glass-effect rounded-full px-4 py-2 flex items-center gap-2">
            <Upload className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-medium">支持 HTML/JSON 格式</span>
          </div>
          <div className="glass-effect rounded-full px-4 py-2 flex items-center gap-2">
            <Download className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium">{stats.totalCategories} 个分类</span>
          </div>
        </div>

        <div className="animate-fade-in-up delay-200 grid gap-6 md:grid-cols-2">
          {/* Import Card */}
          <div className="action-card" style={{ "--accent-color": "#10b981" } as React.CSSProperties}>
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Upload className="h-6 w-6 text-emerald-500" />
              </div>
              <div>
                <h3 className="font-semibold mb-1" style={{ fontFamily: "var(--font-space-grotesk)" }}>导入书签</h3>
                <p className="text-sm text-muted-foreground">
                  从 Chrome、Firefox、Edge 等浏览器导入书签
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Format Selection */}
              <div>
                <Label>导入格式</Label>
                <Select
                  value={importFormat}
                  onValueChange={(value: "html" | "json") =>
                    setImportFormat(value)
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="html">
                      <div className="flex items-center gap-2">
                        <FileCode className="h-4 w-4" />
                        HTML 书签
                      </div>
                    </SelectItem>
                    <SelectItem value="json">
                      <div className="flex items-center gap-2">
                        <FileJson className="h-4 w-4" />
                        JSON 格式
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Category Selection */}
              <div>
                <Label>导入到分类</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="选择分类（默认使用第一个）" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Drop Zone */}
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragActive
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={importFormat === "html" ? ".html" : ".json"}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                />
                <Upload className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-2">
                  拖拽文件到此处，或
                </p>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                >
                  {isImporting ? "处理中..." : "选择文件"}
                </Button>
                <p className="text-xs text-muted-foreground mt-4">
                  {importFormat === "html"
                    ? "支持 Chrome、Firefox、Edge 导出的书签 HTML 文件"
                    : "支持标准 JSON 格式的书签文件"}
                </p>
              </div>
            </div>
          </div>

          {/* Export Card */}
          <div className="action-card" style={{ "--accent-color": "#3b82f6" } as React.CSSProperties}>
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Download className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <h3 className="font-semibold mb-1" style={{ fontFamily: "var(--font-space-grotesk)" }}>导出书签</h3>
                <p className="text-sm text-muted-foreground">
                  导出所有书签为标准格式，方便备份或迁移
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>导出格式</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="h-20 flex flex-col gap-2"
                    onClick={() => {
                      setIsExporting(true);
                      window.location.href = "/api/import-export/export?format=html";
                      setTimeout(() => setIsExporting(false), 1000);
                    }}
                    disabled={isExporting}
                  >
                    <FileCode className="h-6 w-6" />
                    <span className="text-sm">HTML 书签</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-20 flex flex-col gap-2"
                    onClick={handleExport}
                    disabled={isExporting}
                  >
                    <FileJson className="h-6 w-6" />
                    <span className="text-sm">JSON 格式</span>
                  </Button>
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                <p>导出的文件包含：</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>所有分类信息</li>
                  <li>所有链接（标题、URL、描述）</li>
                  <li>分类层级关系</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Help Section */}
        <div className="action-card" style={{ "--accent-color": "#8b5cf6" } as React.CSSProperties}>
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <FileCode className="h-6 w-6 text-violet-500" />
            </div>
            <div>
              <h3 className="font-semibold mb-1" style={{ fontFamily: "var(--font-space-grotesk)" }}>导出浏览器书签</h3>
              <p className="text-sm text-muted-foreground">
                从浏览器导出书签的步骤
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Chrome</h4>
              <p className="text-muted-foreground">
                书签栏 → 右键 → "导出书签" → 保存为 HTML 文件
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Firefox</h4>
              <p className="text-muted-foreground">
                书签栏 → 右键 → "显示全部书签" → 工具栏 → 导入和备份 → 导出
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Edge</h4>
              <p className="text-muted-foreground">
                收藏夹 → 右键 → "导出收藏夹" → 保存为 HTML 文件
              </p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
