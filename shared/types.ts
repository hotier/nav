/** 前后端共享的数据类型（Nitro 与 Vue 均可导入） */

export interface Category {
  id: string;
  slug: string | null;
  name: string;
  icon: string | null;
  parentId: string | null;
  isPublic: boolean;
  isHidden: boolean;
  userId: string | null;
  sortOrder: number;
  createdAt: string | Date;
  updatedAt: string | Date;
  _count?: { links: number };
  children?: Category[];
  links?: Link[];
  user?: { id: string; name: string | null; username: string | null; image: string | null };
}

export interface Link {
  id: string;
  title: string;
  url: string;
  altUrl: string | null;
  description: string | null;
  favicon: string | null;
  categoryId: string;
  userId: string;
  isPrivate: boolean;
  isHidden: boolean;
  isPinned: boolean;
  sortOrder: number;
  status: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  category?: Pick<Category, "id" | "name" | "icon">;
  user?: { id: string; name: string | null; username: string | null; image: string | null };
}

export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string | null;
}

export interface LinkFormData {
  title: string;
  url: string;
  altUrl?: string;
  description?: string;
  favicon?: string;
  categoryId: string;
  isPrivate: boolean;
  isPinned?: boolean;
}
