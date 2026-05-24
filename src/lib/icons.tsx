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

// ========== 全库图标名（惰性加载，避免首页加载整个 lucide-react icons 元数据 ~190KB）==========
let _allIconNamesCache: string[] | null = null;
let _loadingPromise: Promise<string[]> | null = null;

export async function getAllIconNames(): Promise<string[]> {
  if (_allIconNamesCache) return _allIconNamesCache;
  if (!_loadingPromise) {
    _loadingPromise = import("lucide-react").then((mod) => {
      _allIconNamesCache = Object.keys(mod.icons).sort();
      return _allIconNamesCache;
    });
  }
  return _loadingPromise;
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
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
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

// ========== 图标渲染 ==========
export function getCategoryIcon(iconName?: string | null, className?: string) {
  if (!iconName) return <Folder className={className} />;
  const Comp = ICON_MAP[iconName];
  return Comp ? <Comp className={className} /> : <Folder className={className} />;
}
