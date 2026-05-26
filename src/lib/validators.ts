import { z } from "zod";

export const createLinkSchema = z.object({
  title: z.string().min(1, "标题不能为空").max(200),
  url: z.string().url("请输入有效的 URL"),
  altUrl: z.string().url().optional().or(z.literal("")),
  description: z.string().max(500).optional(),
  favicon: z.string().url().optional().or(z.literal("")),
  categoryId: z.string().min(1, "请选择分类"),
  isPrivate: z.boolean().default(false),
  isPinned: z.boolean().default(false),
});

export const updateLinkSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  url: z.string().url().optional(),
  altUrl: z.string().url().optional().nullable().or(z.literal("")),
  description: z.string().max(500).optional().nullable(),
  favicon: z.string().url().optional().nullable().or(z.literal("")),
  categoryId: z.string().min(1).optional(),
  isPrivate: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const createCategorySchema = z.object({
  name: z.string().min(1, "分类名称不能为空").max(50),
  icon: z.string().max(100).optional(),
  parentId: z.string().optional().nullable(),
  sortOrder: z.number().int().default(0),
  isPublic: z.boolean().default(false),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  icon: z.string().max(100).optional().nullable(),
  parentId: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
  isPublic: z.boolean().optional(),
});

export const searchSchema = z.object({
  query: z.string().min(1, "搜索关键词不能为空"),
});
