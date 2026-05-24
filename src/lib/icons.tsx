import {
  Folder,
  FolderOpen,
  FolderClosed,
  Archive,
  Briefcase,
  Link,
  Link2,
  Paperclip,
  Globe,
  MapPin,
  MessageCircle,
  MessageSquare,
  Mail,
  Phone,
  Bell,
  AtSign,
  Book,
  BookOpen,
  BookMarked,
  FileCode,
  GraduationCap,
  Code,
  Code2,
  Terminal,
  Braces,
  Bug,
  GitBranch,
  Image,
  Video,
  Music,
  Headphones,
  Gamepad,
  Camera,
  Home,
  Building,
  Landmark,
  ShoppingBag,
  ShoppingCart,
  CreditCard,
  Wallet,
  Tag,
  Tags,
  Star,
  Heart,
  Gem,
  Crown,
  Sparkles,
  Zap,
  Trophy,
  Settings,
  Wrench,
  Shield,
  Lock,
  Key,
  Sun,
  Moon,
  Cloud,
  CloudSun,
  Rocket,
  Lightbulb,
  Coffee,
  Gift,
  Calendar,
  Clock,
  User,
  Users,
  Smile,
  Package,
  Database,
} from "lucide-react";

// ========== 全库图标（惰性加载，共享缓存）==========
type LucideModule = Record<string, React.ComponentType<{ className?: string }>>;

// 用 ICON_MAP 初始化缓存，精选图标和全库图标走同一条渲染路径
let _lucideCache: LucideModule | null = null;
let _loadingPromise: Promise<void> | null = null;

function getCache(): LucideModule {
  if (!_lucideCache) _lucideCache = { ...ICON_MAP };
  return _lucideCache;
}

async function loadLucideModule(): Promise<void> {
  if (_loadingPromise) return _loadingPromise;
  _loadingPromise = import("lucide-react").then((mod) => {
    const icons = (mod as Record<string, unknown>).icons as LucideModule | undefined;
    if (icons && typeof icons === "object") {
      Object.assign(getCache(), icons);
    } else {
      // 回退：从模块导出中提取大写开头的 key
      for (const k of Object.keys(mod)) {
        if (/^[A-Z]/.test(k) && k !== "default" && k !== "icons" && typeof (mod as Record<string, unknown>)[k] === "function") {
          getCache()[k] = (mod as Record<string, unknown>)[k] as React.ComponentType<{ className?: string }>;
        }
      }
    }
  }).catch(() => { /* 加载失败，保持 ICON_MAP 兜底 */ });
  return _loadingPromise;
}

export async function getAllIconNames(): Promise<string[]> {
  await loadLucideModule();
  return Object.keys(getCache()).sort();
}

// ========== 精选图标（站点常用） ==========
export const ICON_NAMES = [
  // 文件夹
  "Folder", "FolderOpen", "FolderClosed", "Archive", "Briefcase",
  // 链接
  "Link", "Link2", "Paperclip", "Globe", "MapPin",
  // 社交/通讯
  "MessageCircle", "MessageSquare", "Mail", "Phone", "Bell", "AtSign",
  // 文档/知识
  "Book", "BookOpen", "BookMarked", "FileCode", "GraduationCap",
  // 编码/技术
  "Code", "Code2", "Terminal", "Braces", "Bug", "GitBranch",
  // 媒体
  "Image", "Video", "Music", "Headphones", "Gamepad", "Camera",
  // 办公
  "Home", "Building", "Landmark",
  // 商业/购物
  "ShoppingBag", "ShoppingCart", "CreditCard", "Wallet", "Tag", "Tags",
  // 收藏/标记
  "Star", "Heart", "Gem", "Crown", "Sparkles", "Zap", "Trophy",
  // 工具
  "Settings", "Wrench", "Shield", "Lock", "Key",
  // 天气/主题
  "Sun", "Moon", "Cloud", "CloudSun",
  // 其它
  "Rocket", "Lightbulb", "Coffee", "Gift", "Calendar", "Clock",
  "User", "Users", "Smile", "Package", "Database",
] as const;

// ========== 具名图标查找表（无 import *，tree-shake 友好） ==========
export const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Folder,
  FolderOpen,
  FolderClosed,
  Archive,
  Briefcase,
  Link,
  Link2,
  Paperclip,
  Globe,
  MapPin,
  MessageCircle,
  MessageSquare,
  Mail,
  Phone,
  Bell,
  AtSign,
  Book,
  BookOpen,
  BookMarked,
  FileCode,
  GraduationCap,
  Code,
  Code2,
  Terminal,
  Braces,
  Bug,
  GitBranch,
  Image,
  Video,
  Music,
  Headphones,
  Gamepad,
  Camera,
  Home,
  Building,
  Landmark,
  ShoppingBag,
  ShoppingCart,
  CreditCard,
  Wallet,
  Tag,
  Tags,
  Star,
  Heart,
  Gem,
  Crown,
  Sparkles,
  Zap,
  Trophy,
  Settings,
  Wrench,
  Shield,
  Lock,
  Key,
  Sun,
  Moon,
  Cloud,
  CloudSun,
  Rocket,
  Lightbulb,
  Coffee,
  Gift,
  Calendar,
  Clock,
  User,
  Users,
  Smile,
  Package,
  Database,
};

// ========== 图标解析（共用的纯查找逻辑） ==========
/** 按名称获取图标组件（ICON_MAP 优先，缓存兜底）；供 DynamicIcon 使用 */
export function getIconComponent(name: string): React.ComponentType<{ className?: string }> | undefined {
  return ICON_MAP[name] ?? getCache()[name] ?? undefined;
}

/** 供 DynamicIcon 使用的全量 lucide 模块加载器 */
export { loadLucideModule };
