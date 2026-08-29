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
  createdAt: Date;
  updatedAt: Date;
  category?: Category;
  user?: {
    id: string;
    name: string | null;
    username: string | null;
    image: string | null;
  };
}

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
  createdAt: Date;
  updatedAt: Date;
  children?: Category[];
  links?: Link[];
  _count?: {
    links: number;
  };
  user?: {
    id: string;
    name: string | null;
    username: string | null;
    image: string | null;
  };
}

export interface CreateLinkInput {
  title: string;
  url: string;
  altUrl?: string;
  description?: string;
  favicon?: string;
  categoryId: string;
  isPrivate?: boolean;
  isPinned?: boolean;
}

export interface UpdateLinkInput {
  title?: string;
  url?: string;
  altUrl?: string;
  description?: string;
  favicon?: string;
  categoryId?: string;
  isPrivate?: boolean;
  isHidden?: boolean;
  isPinned?: boolean;
  sortOrder?: number;
}

export interface CreateCategoryInput {
  name: string;
  icon?: string;
  parentId?: string;
  sortOrder?: number;
}

export interface UpdateCategoryInput {
  name?: string;
  icon?: string;
  parentId?: string;
  sortOrder?: number;
  isHidden?: boolean;
}

export interface SearchResult {
  links: Link[];
  categories: Category[];
}

export interface ExportData {
  version: string;
  exportedAt: string;
  categories: Category[];
  links: Link[];
}
