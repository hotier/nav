import { and, asc, desc, eq, max } from "drizzle-orm";
import { z } from "zod";
import { getDb, getDbPool, isUniqueViolation } from "~~/server/utils/db";
import { requireSession } from "~~/server/utils/session";
import { incrementTableVersion } from "~~/server/utils/queries";
import { cleanUrl, linkUrlKey, recognizeUrl } from "~~/server/utils/recognize-url";
import { defineApiHandler, fail } from "~~/server/utils/api";
import { categories, links } from "~~/server/database/schema";

const importSchema = z.object({
  data: z.string(),
  format: z.enum(["html", "json"]),
  categoryId: z.string().optional(),
});

interface BookmarkLink {
  title: string;
  url: string;
  description?: string;
}

/** 解析浏览器导出的 Netscape 书签 HTML 格式 */
function parseNetscapeBookmarks(html: string): BookmarkLink[] {
  const result: BookmarkLink[] = [];
  // 兼容 <DT><A ...> 与 <DT> <A ...> 等写法（正则已带 i 标志）
  const regex = /<DT>\s*<A[^>]*HREF=["']([^"']+)["'][^>]*>([^<]+)<\/A>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    const url = cleanUrl(match[1]);
    const title = decodeHtmlEntities(match[2].trim());

    if (url && title && !url.startsWith("javascript:")) {
      result.push({ url, title });
    }
  }

  return result;
}

/** 从导出的 JSON 中提取链接列表（兼容多种格式） */
function extractLinksFromJson(parsed: unknown): BookmarkLink[] {
  // 格式1: 纯链接数组 [{title, url}, ...]
  if (Array.isArray(parsed)) {
    return parsed
      .map((item: Record<string, unknown>) => ({
        title: String(item.title || item.name || "Untitled"),
        url: cleanUrl(String(item.url || item.link || "")),
        description: String(item.description || item.desc || ""),
      }))
      .filter((item) => item.url);
  }

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;

    // 格式2: 本系统导出的 { version, exportedAt, categories, links }
    if (Array.isArray(obj.links)) {
      return (obj.links as Array<Record<string, unknown>>)
        .map((item) => ({
          title: String(item.title || item.name || "Untitled"),
          url: cleanUrl(String(item.url || "")),
          description: String(item.description || ""),
        }))
        .filter((item) => item.url);
    }

    // 格式3: { links: [...] } 或其他对象嵌套
    for (const key of Object.keys(obj)) {
      if (Array.isArray(obj[key])) {
        const maybe = extractLinksFromJson(obj[key]);
        if (maybe.length > 0) return maybe;
      }
    }
  }

  return [];
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

/**
 * 导入后异步抓取元数据：对缺失 description/favicon 的链接逐个调用 recognizeUrl。
 * 限并发 3，失败不留痕迹。
 */
async function fetchMetadataForImported(userId: string, categoryId: string, amount: number) {
  const db = getDb();
  // 取回刚创建的链接（按 createdAt 倒序取最新 amount 条）
  const newLinks = await db
    .select({
      id: links.id,
      url: links.url,
      title: links.title,
      description: links.description,
      favicon: links.favicon,
    })
    .from(links)
    .where(and(eq(links.userId, userId), eq(links.categoryId, categoryId)))
    .orderBy(desc(links.createdAt))
    .limit(amount);

  // 筛选出需要抓取的链接（描述或 favicon 缺失）
  const pending = newLinks.filter((l) => !l.description || !l.favicon);

  if (pending.length === 0) return;

  const concurrency = 3;
  for (let i = 0; i < pending.length; i += concurrency) {
    const batch = pending.slice(i, i + concurrency);
    await Promise.allSettled(
      batch.map(async (link) => {
        const meta = await recognizeUrl(link.url);
        if (!meta.title) return; // 抓取失败

        const updates: { description?: string; favicon?: string } = {};
        if (!link.description && meta.description) updates.description = meta.description;
        if (!link.favicon && meta.favicon) updates.favicon = meta.favicon;

        if (Object.keys(updates).length > 0) {
          await db
            .update(links)
            .set(updates)
            .where(eq(links.id, link.id))
            .catch(() => {}); // 单条更新失败不影响其他
        }
      }),
    );
  }
}

export default defineApiHandler(async (event) => {
  const session = await requireSession(event);

  let json: unknown;
  try {
    json = await readBody(event);
  } catch {
    // 旧实现里 request.json() 失败走外层兜底 → 500 导入失败
    console.error("Failed to import: 请求体不是合法的 JSON");
    return fail(event, 500, "导入失败");
  }
  if (json === undefined) {
    // 空请求体在旧实现里同样由外层兜底成 500 导入失败
    return fail(event, 500, "导入失败");
  }

  try {
    const result = importSchema.safeParse(json);
    if (!result.success) {
      return fail(event, 400, result.error.errors[0]?.message || "参数错误");
    }

    const { data, format, categoryId } = result.data;
    let bookmarkLinks: BookmarkLink[] = [];

    if (format === "html") {
      bookmarkLinks = parseNetscapeBookmarks(data);
    } else {
      try {
        const parsed = JSON.parse(data);
        bookmarkLinks = extractLinksFromJson(parsed);
      } catch {
        return fail(event, 400, "JSON 格式错误");
      }
    }

    if (bookmarkLinks.length === 0) {
      return fail(event, 400, "没有找到可导入的链接");
    }

    const db = getDb();
    let targetCategoryId: string;

    if (categoryId) {
      targetCategoryId = categoryId;
    } else {
      // 只查找当前用户自己的分类，避免把链接导入到他人分类
      const [defaultCategory] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.userId, session.user.id))
        .orderBy(asc(categories.sortOrder))
        .limit(1);

      if (defaultCategory) {
        targetCategoryId = defaultCategory.id;
      } else {
        // 兜底创建的默认分类为公开（普通用户有权创建公开分类）。
        // 若已有同名公开分类（公开名全局唯一），降级为私有创建，避免撞名
        const [dup] = await db
          .select({ id: categories.id })
          .from(categories)
          .where(and(eq(categories.isPublic, true), eq(categories.name, "默认分类")))
          .limit(1);
        const [newCategory] = await db
          .insert(categories)
          .values({
            name: "默认分类",
            sortOrder: 0,
            isPublic: !dup,
            userId: session.user.id,
          })
          .returning({ id: categories.id });
        targetCategoryId = newCategory.id;
      }
    }

    // 验证目标分类是否允许写入
    const [targetCat] = await db
      .select({
        id: categories.id,
        isPublic: categories.isPublic,
        userId: categories.userId,
      })
      .from(categories)
      .where(eq(categories.id, targetCategoryId))
      .limit(1);
    if (!targetCat) {
      return fail(event, 404, "分类不存在");
    }
    const userRole = session.user.role ?? undefined;
    if (userRole !== "admin" && !targetCat.isPublic && targetCat.userId !== session.user.id) {
      return fail(event, 403, "无权向此分类导入链接");
    }

    const existingLinks = await db
      .select({ urlKey: links.urlKey })
      .from(links)
      .where(eq(links.userId, session.user.id));
    // 库内已存在 + 本次导入文件内部重复都要去掉，否则会撞唯一约束
    const seenUrlKeys = new Set(existingLinks.map((l) => l.urlKey));

    const newLinks = bookmarkLinks.flatMap((link) => {
      const urlKey = linkUrlKey(link.url);
      if (!urlKey || seenUrlKeys.has(urlKey)) return [];
      seenUrlKeys.add(urlKey);
      return [{ ...link, urlKey }];
    });

    if (newLinks.length === 0) {
      return {
        imported: 0,
        skipped: bookmarkLinks.length,
        message: "所有链接已存在",
      };
    }

    // 数据写入 + 版本号递增同事务：用户内全局编号与创建接口/拖拽重排体系一致
    const createdLinks = await getDbPool().transaction(async (tx) => {
      const [aggregate] = await tx
        .select({ value: max(links.sortOrder) })
        .from(links)
        .where(eq(links.userId, session.user.id));

      const created = await tx
        .insert(links)
        .values(
          newLinks.map((link, index) => ({
            title: link.title,
            url: cleanUrl(link.url),
            urlKey: link.urlKey,
            description: link.description,
            categoryId: targetCategoryId,
            userId: session.user.id,
            sortOrder: (aggregate?.value ?? -1) + index + 1,
          })),
        )
        .returning({ id: links.id });

      await incrementTableVersion("Category", tx);
      await incrementTableVersion("Link", tx);
      return created;
    });

    // 异步抓取元数据（标题、描述、favicon），不阻塞响应
    fetchMetadataForImported(session.user.id, targetCategoryId, createdLinks.length).catch((e) =>
      console.warn("[import] 元数据抓取失败:", e),
    );

    return {
      imported: createdLinks.length,
      skipped: bookmarkLinks.length - createdLinks.length,
      message: `成功导入 ${createdLinks.length} 个链接`,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail(event, 409, "导入过程中遇到并发写入的重复链接，请重试");
    }
    console.error("Failed to import:", error);
    return fail(event, 500, "导入失败");
  }
});
