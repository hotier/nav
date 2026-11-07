import { links } from "./schema";

/**
 * 链接读路径的显式列清单（**不含 `urlKey`**）。
 *
 * 原因：`urlKey` 只用于唯一约束与查重，前端契约（`shared/types.ts` 的 `Link`）里也没有它。
 * 显式列清单让读路径不依赖该列是否存在，避免「库未执行 urlKey 迁移 → 整条列表查询 500」。
 * 新增对外可见的链接字段时，在这里补一列即可，全站读路径自动带上。
 */
export const linkColumns = {
  id: links.id,
  title: links.title,
  url: links.url,
  altUrl: links.altUrl,
  description: links.description,
  favicon: links.favicon,
  categoryId: links.categoryId,
  userId: links.userId,
  isPrivate: links.isPrivate,
  isHidden: links.isHidden,
  isPinned: links.isPinned,
  sortOrder: links.sortOrder,
  status: links.status,
  createdAt: links.createdAt,
  updatedAt: links.updatedAt,
};
