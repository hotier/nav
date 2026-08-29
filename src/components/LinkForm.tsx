"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Globe, Lock, PencilSparkles, Pin, PinOff } from "lucide-react";
import toast from "react-hot-toast";
import { cleanUrl } from "@/lib/recognize-url";
import { cn } from "@/lib/utils";

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
  /** 编辑模式：跳过自动识别，直接提交已有数据 */
  isEdit?: boolean;
  /** 是否显示置顶开关（管理页已停用置顶功能） */
  showPinned?: boolean;
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
  isEdit = false,
  showPinned = true,
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

    // 仅新建时，且必填项（标题/URL/分类）存在空缺才自动识别（5秒超时）；
    // 描述、图标URL 为可选项，缺失不触发识别；编辑模式直接提交已有数据
    if (!isEdit && (!formData.title || !formData.url || !formData.categoryId)) {
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
      // 识别涉及 HTML 抓取 + faviconsnap 等多个外部请求，且慢站点在你的网络环境下可能耗时较久，
      // 给足 25 秒（服务端整体硬超时 12 秒），避免误报“识别超时”
      const timer = setTimeout(() => controller.abort(), 25000);
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
            className="flex-1"
          />
          {(
            <Button
              type="button"
              variant="outline"
              onClick={handleRecognize}
              disabled={isRecognizing || !formData.url}
              className="shrink-0 gap-1.5"
            >
              {isRecognizing ? (
                "识别中..."
              ) : (
                <>
                  <PencilSparkles className="h-4 w-4" />
                  识别
                </>
              )}
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
        <Textarea
          id="link-desc"
          value={formData.description || ""}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="链接描述（可选）"
          className="mt-1 resize-none"
        />
      </div>
      <div>
        <Label htmlFor="link-cat">
          分类 <span className="text-danger">*</span>
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
                    <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-px rounded-full bg-success-muted text-success-muted-foreground">
                      <Globe className="h-2.5 w-2.5" />
                      公开
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-px rounded-full bg-warning-muted text-warning-muted-foreground">
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
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          {/* 开关开启 = 公开，关闭 = 私有（内部仍以 isPrivate 存储） */}
          <Switch
            id="link-private"
            checked={!formData.isPrivate}
            onCheckedChange={(c) => setFormData({ ...formData, isPrivate: !c })}
          />
          <Label
            htmlFor="link-private"
            className={cn(
              "cursor-pointer inline-flex items-center gap-1.5 transition-colors",
              formData.isPrivate ? "text-warning" : "text-success"
            )}
          >
            {formData.isPrivate ? (
              <Lock className="h-3.5 w-3.5" />
            ) : (
              <Globe className="h-3.5 w-3.5" />
            )}
            {formData.isPrivate ? "私有" : "公开"}
          </Label>
        </div>
        {showPinned && (
          <div className="flex items-center gap-3">
            <Switch
              id="link-pinned"
              checked={formData.isPinned}
              onCheckedChange={(c) => setFormData({ ...formData, isPinned: c })}
            />
            <Label
              htmlFor="link-pinned"
              className={cn(
                "cursor-pointer inline-flex items-center gap-1.5 transition-colors",
                formData.isPinned ? "text-primary" : "text-muted-foreground"
              )}
            >
              {formData.isPinned ? (
                <Pin className="h-3.5 w-3.5" />
              ) : (
                <PinOff className="h-3.5 w-3.5" />
              )}
              {formData.isPinned ? "置顶" : "未置顶"}
            </Label>
          </div>
        )}
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
