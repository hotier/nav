"use client";

import { useState, useCallback, useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ExternalLink,
  Edit,
  Trash2,
  Copy,
  QrCode,
  Pin,
  Link2,
  Lock,
  GripVertical,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { LinkForm } from "@/components/LinkForm";
import type { Link as LinkType, Category } from "@/types";
import { proxyImageUrl } from "@/lib/utils";
import toast from "react-hot-toast";

interface LinkCardProps {
  link: LinkType;
  categories: Category[];
  isAdmin?: boolean;
  isDraggable?: boolean;
  searchQuery?: string;
  onEdit?: (link: LinkType) => void;
  onDelete?: (id: string) => void;
  onUpdate?: (id: string, data: Partial<LinkType>, silent?: boolean) => Promise<void>;
}

function highlightText(text: string, query?: string) {
  if (!query?.trim()) return text;
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${esc})`, "gi");
  return text.split(regex).map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-yellow-200 dark:bg-yellow-500/30 rounded px-0.5">{part}</mark>
    ) : (
      part
    )
  );
}

export function LinkCard({
  link,
  categories,
  isAdmin = false,
  isDraggable = false,
  searchQuery,
  onDelete,
  onUpdate,
}: LinkCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: link.id, disabled: !isDraggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  const [showQr, setShowQr] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  // 图标展示逻辑（与 faviconsnap 录入时获取配套）：
  // favicon URL 在添加/编辑时由 faviconsnap 解析并存 DB（见 lib/recognize-url.ts），
  // 展示时只读库渲染，无运行时解析/回退链。加载失败仅本次会话回退到默认图标，
  // 不写 localStorage 标记（下次刷新重试）。
  const [faviconBroken, setFaviconBroken] = useState(false);

  // link.favicon 变化（编辑保存/重新识别）时重置失效状态
  useEffect(() => {
    setFaviconBroken(false);
  }, [link.favicon]);

  // ✅ 修复：右键菜单 + 弹窗冲突，解决页面点不动
  useEffect(() => {
    if (!showQr && !isEditing) {
      document.body.style.pointerEvents = "";
      document.documentElement.style.pointerEvents = "";
      document.body.style.overflow = "";
    }
  }, [showQr, isEditing]);

  const handleCopy = useCallback(async () => {
    setContextMenuOpen(false);
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success("链接已复制");
    } catch {
      toast.error("复制失败");
    }
  }, [link.url]);

  const handleCopyMarkdown = useCallback(async () => {
    setContextMenuOpen(false);
    try {
      await navigator.clipboard.writeText(`[${link.title}](${link.url})`);
      toast.success("Markdown 已复制");
    } catch {
      toast.error("复制失败");
    }
  }, [link.title, link.url]);

  const handleOpenLink = useCallback(() => {
    setContextMenuOpen(false);
    window.open(link.url, "_blank", "noopener,noreferrer");
  }, [link.url]);

  const handleCardClick = useCallback(() => {
    // 如果用户正在选中文本，不打开发链接
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;
    handleOpenLink();
  }, [handleOpenLink]);

  const handleOpenAltLink = useCallback(() => {
    setContextMenuOpen(false);
    if (link.altUrl) {
      window.open(link.altUrl, "_blank", "noopener,noreferrer");
    }
  }, [link.altUrl]);

  const handleEditSubmit = async (data: any) => {
    if (!onUpdate) return;
    // 乐观更新：立即关闭弹窗，请求在后台完成；成功/失败提示由 LinksGrid.handleUpdate 统一处理
    setIsEditing(false);
    onUpdate(link.id, data, false).catch(() => {});
  };

  // ✅ 修复：延迟打开弹窗，避免 shadcn 冲突
  const handleShowQr = () => {
    setContextMenuOpen(false);
    setTimeout(() => setShowQr(true), 10);
  };

  const handleOpenEdit = () => {
    setContextMenuOpen(false);
    setTimeout(() => setIsEditing(true), 10);
  };

  return (
    <>
      <ContextMenu onOpenChange={setContextMenuOpen}>
        <ContextMenuTrigger asChild>
          <div
            ref={setNodeRef}
            style={style}
            className={`h-full group bg-card/80 dark:bg-card/80 backdrop-blur-xl rounded-2xl border border-border p-4 hover:border-primary hover:shadow-lg hover:shadow-primary/10 transition-all duration-300 ${isDragging ? "shadow-xl ring-2 ring-primary" : ""}`}
            onClick={handleCardClick}
          >
            <div className="flex items-start gap-3">
              {isDraggable && (
                <div
                  {...attributes}
                  {...listeners}
                  className="flex-shrink-0 cursor-grab active:cursor-grabbing p-1 -ml-1 hover:bg-muted dark:hover:bg-muted rounded-lg transition-colors"
                  title="拖拽排序"
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                </div>
              )}

              <div className="flex-shrink-0">
                {link.favicon && !faviconBroken ? (
                  <img
                    src={link.favicon.startsWith("https://faviconsnap.com/")
                      ? link.favicon
                      : proxyImageUrl(link.favicon)}
                    alt=""
                    className="h-10 w-10 rounded-xl object-cover"
                    onError={() => setFaviconBroken(true)}
                  />
                ) : null}
                <div className={`favicon-fallback h-10 w-10 rounded-xl bg-gradient-to-br from-primary/10 to-sky-500/5 flex items-center justify-center ${link.favicon && !faviconBroken ? "hidden" : ""}`}>
                  <Link2 className="h-5 w-5 text-primary" />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="font-semibold text-foreground truncate select-text cursor-text"
                    title={link.title}
                  >{highlightText(link.title, searchQuery)}</span>
                  {link.isPinned && (
                    <span className="inline-flex items-center gap-0.5 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded flex-shrink-0">
                      <Pin className="h-3 w-3" />
                      置顶
                    </span>
                  )}
                  {link.isPrivate && (
                    <span className="inline-flex items-center gap-0.5 text-xs bg-warning-muted text-warning-muted-foreground px-1.5 py-0.5 rounded flex-shrink-0">
                      <Lock className="h-3 w-3" />
                      私有
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mb-1 select-text" title={link.url}>{highlightText(link.url, searchQuery)}</p>
                <p
                  className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem] select-text"
                  title={link.description || undefined}
                >
                  {link.description ? highlightText(link.description, searchQuery) : ""}
                </p>
              </div>

              <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopy();
                  }}
                  className="p-2 rounded-xl hover:bg-muted dark:hover:bg-muted text-muted-foreground hover:text-primary dark:hover:text-primary transition-colors"
                  title="复制链接"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-52">
          <ContextMenuItem onClick={handleOpenLink}>
            <ExternalLink className="mr-2 h-4 w-4" />
            打开链接
          </ContextMenuItem>
          {link.altUrl && (
            <ContextMenuItem onClick={handleOpenAltLink}>
              <ExternalLink className="mr-2 h-4 w-4" />
              打开备用链接
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={handleCopy}>
            <Copy className="mr-2 h-4 w-4" />
            复制链接
          </ContextMenuItem>
          <ContextMenuItem onClick={handleCopyMarkdown}>
            <Copy className="mr-2 h-4 w-4" />
            复制为 Markdown
          </ContextMenuItem>
          <ContextMenuItem onClick={handleShowQr}>
            <QrCode className="mr-2 h-4 w-4" />
            显示二维码
          </ContextMenuItem>
          {isAdmin && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={handleOpenEdit}>
                <Edit className="mr-2 h-4 w-4" />
                编辑链接
              </ContextMenuItem>
              <ContextMenuItem onClick={() => onUpdate?.(link.id, { isPinned: !link.isPinned })}>
                <Pin className="mr-2 h-4 w-4" />
                {link.isPinned ? "取消置顶" : "置顶"}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={() => {
                  setContextMenuOpen(false);
                  onDelete?.(link.id);
                }}
                className="text-danger focus:text-danger"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={showQr} onOpenChange={setShowQr}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-center">{link.title}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center p-4 bg-card dark:bg-card rounded-lg">
            <QRCodeSVG value={link.url} size={180} />
          </div>
          <p className="text-center text-xs text-muted-foreground break-all px-2">
            {link.url}
          </p>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>编辑链接</DialogTitle>
          </DialogHeader>
          <LinkForm
            initialData={{
              title: link.title,
              url: link.url,
              altUrl: link.altUrl || "",
              description: link.description || "",
              favicon: link.favicon || "",
              categoryId: link.categoryId,
              isPrivate: link.isPrivate,
              isPinned: link.isPinned,
            }}
            categories={categories.filter((c) => !c.parentId)}
            onSubmit={handleEditSubmit}
            onCancel={() => setIsEditing(false)}
            submitLabel="保存"
            isEdit
          />
        </DialogContent>
      </Dialog>
    </>
  );
}