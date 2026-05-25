"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
  onUpdate?: (id: string, data: Partial<LinkType>) => Promise<void>;
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
  const [faviconBroken, setFaviconBroken] = useState(false);
  const [faviconSrc, setFaviconSrc] = useState<string | null>(null);
  const [triedHunter, setTriedHunter] = useState(false);
  const [triedGoogle, setTriedGoogle] = useState(false);
  const [faviconKey, setFaviconKey] = useState(0); // key 变化时强制卸载/挂载 img，避免 onError 连锁反应

  // 用 ref 保存 tried 状态，避免 setTimeout 闭包读到过期值
  const triedHunterRef = useRef(false);
  const triedGoogleRef = useRef(false);
  const faviconTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const FAVICON_TIMEOUT = 8000; // 8 秒超时

  // 从 URL 提取域名
  const extractDomain = (url: string) => {
    try {
      const u = new URL(url);
      return u.hostname;
    } catch {
      return "";
    }
  };

  const domain = extractDomain(link.url);
  const hunterUrl = domain ? `https://logos.hunter.io/${domain}` : "";
  const googleFaviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : "";

  // 清除超时定时器
  const clearFaviconTimeout = () => {
    if (faviconTimeoutRef.current) {
      clearTimeout(faviconTimeoutRef.current);
      faviconTimeoutRef.current = null;
    }
  };

  // 初始化：检查 localStorage 中该 favicon 是否曾被标记为失效
  useEffect(() => {
    setFaviconSrc(link.favicon || null);
    setFaviconKey(0);
    setTriedHunter(false);
    setTriedGoogle(false);
    triedHunterRef.current = false;
    triedGoogleRef.current = false;
    if (link.favicon) {
      const cached = localStorage.getItem(`nav_favicon_${link.id}`);
      if (cached) {
        try {
          const data = JSON.parse(cached) as { broken: boolean; url: string };
          if (data.broken && data.url === link.favicon) {
            setFaviconBroken(true);
          }
        } catch { /* ignore */ }
      }
    } else {
      setFaviconBroken(false);
    }
  }, [link.favicon, link.id]);

  // 无 favicon 时自动尝试获取
  useEffect(() => {
    if (!link.favicon && domain && !triedHunterRef.current && !triedGoogleRef.current && !faviconBroken) {
      triedHunterRef.current = true;
      setTriedHunter(true);
      setFaviconKey((k) => k + 1);
      setFaviconSrc(hunterUrl);
    }
  }, [link.favicon, domain, triedHunter, triedGoogle, faviconBroken]);

  // 核心回退逻辑：按优先级依次尝试
  const triggerFaviconFallback = useCallback(() => {
    // 每次主动切换源时 bump key，旧 img 被卸载，其 onError 不会传播过来
    if (!triedHunterRef.current && hunterUrl) {
      triedHunterRef.current = true;
      setTriedHunter(true);
      setFaviconKey((k) => k + 1);
      setFaviconSrc(hunterUrl);
      return;
    }
    // 第二优先级：hunter.io 失败 → 尝试 Google Favicons
    if (!triedGoogleRef.current && googleFaviconUrl) {
      triedGoogleRef.current = true;
      setTriedGoogle(true);
      setFaviconKey((k) => k + 1);
      setFaviconSrc(googleFaviconUrl);
      return;
    }
    // 所有源均失败，标记为失效
    setFaviconBroken(true);
    try {
      localStorage.setItem(
        `nav_favicon_${link.id}`,
        JSON.stringify({ broken: true, url: link.favicon || hunterUrl })
      );
    } catch { /* ignore */ }
  }, [hunterUrl, googleFaviconUrl, link.id, link.favicon]);

  // img onError 回调：清除超时后进入回退链
  const handleFaviconError = useCallback(() => {
    clearFaviconTimeout();
    triggerFaviconFallback();
  }, [triggerFaviconFallback]);

  // img onLoad 回调：清除超时，若来自 hunter.io / Google 则自动写入
  const handleFaviconLoad = useCallback(() => {
    clearFaviconTimeout();
    if (triedHunterRef.current && !triedGoogleRef.current && faviconSrc === hunterUrl) {
      onUpdate?.(link.id, { favicon: hunterUrl });
    }
    if (triedGoogleRef.current && faviconSrc === googleFaviconUrl) {
      onUpdate?.(link.id, { favicon: googleFaviconUrl });
    }
  }, [faviconSrc, hunterUrl, googleFaviconUrl, link.id, onUpdate]);

  // 超时兜底仅用于原始 icon：8 秒内未加载成功也未报错 → 进入回退链
  // hunter.io / Google 不加超时，只靠 onError 自然驱动，确保“一旦可用不会进入下一步”
  useEffect(() => {
    clearFaviconTimeout();

    if (!faviconSrc || faviconBroken || triedHunterRef.current) return;

    faviconTimeoutRef.current = setTimeout(() => {
      clearFaviconTimeout();
      triggerFaviconFallback();
    }, FAVICON_TIMEOUT);

    return clearFaviconTimeout;
  }, [faviconSrc, faviconBroken, triggerFaviconFallback]);

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
    try {
      await onUpdate(link.id, data);
      setIsEditing(false);
      toast.success("链接已更新");
    } catch {
      toast.error("更新失败");
    }
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
            className={`h-full group bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-700/50 p-4 hover:border-blue-400 hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-300 ${isDragging ? "shadow-xl ring-2 ring-blue-400" : ""}`}
            onClick={handleCardClick}
          >
            <div className="flex items-start gap-3">
              {isDraggable && (
                <div
                  {...attributes}
                  {...listeners}
                  className="flex-shrink-0 cursor-grab active:cursor-grabbing p-1 -ml-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  title="拖拽排序"
                >
                  <GripVertical className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                </div>
              )}

              <div className="flex-shrink-0">
                {faviconSrc && !faviconBroken ? (
                  <img
                    key={faviconKey}
                    src={proxyImageUrl(faviconSrc)}
                    alt=""
                    className="h-10 w-10 rounded-xl object-cover"
                    onError={handleFaviconError}
                    onLoad={handleFaviconLoad}
                  />
                ) : null}
                <div className={`favicon-fallback h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500/10 to-sky-500/5 flex items-center justify-center ${faviconSrc && !faviconBroken ? "hidden" : ""}`}>
                  <Link2 className="h-5 w-5 text-[#3498db]" />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {link.isPinned && <span className="text-amber-500">📌</span>}
                  <span
                    className="font-semibold text-slate-800 dark:text-white truncate select-text cursor-text"
                    title={link.title}
                  >{highlightText(link.title, searchQuery)}</span>
                  {link.isPrivate && (
                    <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded flex-shrink-0">
                      私有
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 truncate mb-1 select-text" title={link.url}>{highlightText(link.url, searchQuery)}</p>
                <p
                  className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 min-h-[2rem] select-text"
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
                  className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
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
                className="text-red-600 focus:text-red-600"
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
          <div className="flex justify-center p-4 bg-white dark:bg-slate-800 rounded-lg">
            <QRCodeSVG value={link.url} size={180} />
          </div>
          <p className="text-center text-xs text-gray-400 dark:text-slate-400 break-all px-2">
            {link.url}
          </p>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent>
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
          />
        </DialogContent>
      </Dialog>
    </>
  );
}