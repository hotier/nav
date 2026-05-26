"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Globe, Lock } from "lucide-react";
import toast from "react-hot-toast";
import { cleanUrl } from "@/lib/recognize-url";

interface Category {
  id: string;
  name: string;
  isPublic: boolean;
}

interface LinkFormData {
  title: string;
  url: string;
  altUrl?: string;
  description?: string;
  favicon?: string;
  categoryId: string;
  isPrivate: boolean;
  isPinned?: boolean;
}

interface LinkFormProps {
  initialData?: Partial<LinkFormData>;
  categories: Category[];
  onSubmit: (data: LinkFormData) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
  submitLabel?: string;
}

function isLinkFormData(data: unknown): data is LinkFormData {
  return typeof data === 'object' && data !== null && 'title' in data && 'url' in data;
}

export function LinkForm({
  initialData,
  categories,
  onSubmit,
  onCancel,
  isSubmitting = false,
  submitLabel = "保存",
}: LinkFormProps) {
  // 处理 initialData，可能是完整的 LinkFormData 或只是部分数据
  const safeInitialData: Partial<LinkFormData> = isLinkFormData(initialData) ? initialData : {};
  const [isRecognizing, setIsRecognizing] = useState(false);
  
  const [formData, setFormData] = useState<LinkFormData>({
    title: safeInitialData.title || "",
    url: safeInitialData.url || "",
    altUrl: safeInitialData.altUrl || "",
    description: safeInitialData.description || "",
    favicon: safeInitialData.favicon || "",
    categoryId: safeInitialData.categoryId || "",
    isPrivate: safeInitialData.isPrivate || false,
    isPinned: safeInitialData.isPinned || false,
  });

  const handleUrlClean = () => {
    setFormData((prev) => ({ ...prev, url: cleanUrl(prev.url) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedUrl = cleanUrl(formData.url);
    setFormData((prev) => ({ ...prev, url: cleanedUrl }));

    if (!cleanedUrl || !formData.categoryId) {
      toast.error("请填写必填项");
      return;
    }

    // 如果标题、描述、图标有任一为空，自动识别（5秒超时）
    if (!formData.title || !formData.description || !formData.favicon) {
      setIsRecognizing(true);
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const response = await fetch("/api/links/recognize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: cleanedUrl }),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (response.ok) {
          const data = await response.json();
          const finalData = {
            ...formData,
            url: cleanedUrl,
            title: formData.title || data.title || "",
            description: formData.description || data.description || "",
            favicon: formData.favicon || data.favicon || "",
          };
          await onSubmit(finalData);
        } else {
          await onSubmit({ ...formData, url: cleanedUrl });
        }
      } catch {
        // 超时或网络错误，直接提交
        await onSubmit({ ...formData, url: cleanedUrl });
      } finally {
        setIsRecognizing(false);
      }
    } else {
      await onSubmit({ ...formData, url: cleanedUrl });
    }
  };

  const handleRecognize = async () => {
    const cleanedUrl = cleanUrl(formData.url);
    setFormData((prev) => ({ ...prev, url: cleanedUrl }));

    if (!cleanedUrl) {
      toast.error("请先输入URL");
      return;
    }

    setIsRecognizing(true);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const response = await fetch("/api/links/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: cleanedUrl }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.ok) {
        const data = await response.json();
        setFormData((prev) => ({
          ...prev,
          title: prev.title || data.title || "",
          description: prev.description || data.description || "",
          favicon: prev.favicon || data.favicon || "",
        }));
        toast.success("识别成功");
      } else {
        const error = await response.json();
        toast.error(error.error || "识别失败");
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.error("识别超时");
      } else {
        toast.error("识别失败");
      }
    } finally {
      setIsRecognizing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="link-title">标题 <span className="text-red-500">*</span></Label>
        <Input
          id="link-title"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="可自动识别"
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="link-url">
          URL <span className="text-red-500">*</span>
        </Label>
        <div className="flex gap-2 mt-1">
          <Input
            id="link-url"
            type="url"
            value={formData.url}
            onChange={(e) => setFormData({ ...formData, url: e.target.value })}
            onBlur={handleUrlClean}
            placeholder="https://example.com"
            className="flex-1 h-11"
          />
          {(
            <Button
              type="button"
              variant="outline"
              onClick={handleRecognize}
              disabled={isRecognizing || !formData.url}
            >
              {isRecognizing ? "识别中..." : "识别"}
            </Button>
          )}
        </div>
      </div>
      <div>
        <Label htmlFor="link-favicon">图标URL</Label>
        <Input
          id="link-favicon"
          value={formData.favicon || ""}
          onChange={(e) => setFormData({ ...formData, favicon: e.target.value })}
          placeholder="自动识别或手动输入"
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="link-alturl">备用链接</Label>
        <Input
          id="link-alturl"
          type="url"
          value={formData.altUrl || ""}
          onChange={(e) => setFormData({ ...formData, altUrl: e.target.value })}
          placeholder="内网访问地址（可选）"
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="link-desc">描述</Label>
        <Input
          id="link-desc"
          value={formData.description || ""}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="链接描述（可选）"
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="link-cat">
          分类 <span className="text-red-500">*</span>
        </Label>
        <Select
          value={formData.categoryId}
          onValueChange={(v) => setFormData({ ...formData, categoryId: v })}
        >
          <SelectTrigger className="mt-1 w-full">
            <SelectValue placeholder="选择分类" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                <span className="flex items-center gap-2">
                  <span>{cat.name}</span>
                  {cat.isPublic ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-px rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                      <Globe className="h-2.5 w-2.5" />
                      公开
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-px rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                      <Lock className="h-2.5 w-2.5" />
                      私有
                    </span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="link-private"
            checked={formData.isPrivate}
            onCheckedChange={(c) => setFormData({ ...formData, isPrivate: !!c })}
          />
          <Label htmlFor="link-private">私有</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="link-pinned"
            checked={formData.isPinned}
            onCheckedChange={(c) => setFormData({ ...formData, isPinned: !!c })}
          />
          <Label htmlFor="link-pinned">置顶</Label>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            取消
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting || isRecognizing}>
          {isRecognizing ? "识别中..." : (isSubmitting ? "保存中..." : submitLabel)}
        </Button>
      </div>
    </form>
  );
}
