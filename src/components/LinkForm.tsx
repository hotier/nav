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
import toast from "react-hot-toast";

interface Category {
  id: string;
  name: string;
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.url || !formData.categoryId) {
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
          body: JSON.stringify({ url: formData.url }),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (response.ok) {
          const data = await response.json();
          const finalData = {
            ...formData,
            title: formData.title || data.title || "",
            description: formData.description || data.description || "",
            favicon: formData.favicon || data.favicon || "",
          };
          await onSubmit(finalData);
        } else {
          await onSubmit(formData);
        }
      } catch {
        // 超时或网络错误，直接提交
        await onSubmit(formData);
      } finally {
        setIsRecognizing(false);
      }
    } else {
      await onSubmit(formData);
    }
  };

  const handleRecognize = async () => {
    if (!formData.url) {
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
        body: JSON.stringify({ url: formData.url }),
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
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="选择分类" />
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
