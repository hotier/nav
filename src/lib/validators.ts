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
  isHidden: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

/**
 * 分类名称校验规则：
 * - 录入时自动去除首尾空格
 * - 仅允许中文、数字、大小写字母，以及文字中间的空格
 * - 中间空格计作 1 个占位，总占位（字符数）不超过 20
 */
export const categoryNameSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z
      .string()
      .min(1, "分类名称不能为空")
      .max(20, "分类名称总占位不能超过 20（含中间空格）")
      .regex(
        /^[\u4e00-\u9fa5a-zA-Z0-9 ]+$/,
        "分类名称仅支持中文、数字、大小写字母和中间空格，不可包含特殊字符"
      )
  );

export const createCategorySchema = z.object({
  name: categoryNameSchema,
  icon: z.string().max(100).optional().nullable(),
  parentId: z.string().optional().nullable(),
  sortOrder: z.number().int().default(0),
  isPublic: z.boolean().default(false),
});

export const updateCategorySchema = z.object({
  name: categoryNameSchema.optional(),
  icon: z.string().max(100).optional().nullable(),
  parentId: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
  isPublic: z.boolean().optional(),
  isHidden: z.boolean().optional(),
});

export const searchSchema = z.object({
  query: z.string().min(1, "搜索关键词不能为空"),
});
