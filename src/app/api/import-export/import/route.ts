import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { incrementTableVersion } from "@/lib/queries";
import { recognizeUrl, cleanUrl } from "@/lib/recognize-url";
import { z } from "zod";

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
  const links: BookmarkLink[] = [];
  // 兼容 <DT><A ...> 和 <DT><A ...>
  const regex = /<DT>\s*<A[^>]*HREF=["']([^"']+)["'][^>]*>([^<]+)<\/A>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const url = cleanUrl(match[1]);
    const title = decodeHtmlEntities(match[2].trim());

    if (url && title && !url.startsWith("javascript:")) {
      links.push({ url, title });
    }
  }

  return links;
}

/** 从导出的 JSON 中提取链接列表（兼容多种格式） */
function extractLinksFromJson(parsed: unknown): BookmarkLink[] {
  // 格式1: 纯链接数组 [{title, url}, ...]
  if (Array.isArray(parsed)) {
    return parsed.map((item: Record<string, unknown>) => ({
      title: String(item.title || item.name || "Untitled"),
      url: cleanUrl(String(item.url || item.link || "")),
      description: String(item.description || item.desc || ""),
    })).filter((item) => item.url);
  }

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;

    // 格式2: 本系统导出的 { version, exportedAt, categories, links }
    if (Array.isArray(obj.links)) {
      return (obj.links as Array<Record<string, unknown>>).map((item) => ({
        title: String(item.title || item.name || "Untitled"),
        url: cleanUrl(String(item.url || "")),
        description: String(item.description || ""),
      })).filter((item) => item.url);
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
async function fetchMetadataForImported(userId: string, categoryId: string, count: number) {
  // 取回刚创建的链接（按 createdAt 倒序取最新 count 条）
  const newLinks = await prisma.link.findMany({
    where: { userId, categoryId },
    orderBy: { createdAt: "desc" },
    take: count,
    select: { id: true, url: true, title: true, description: true, favicon: true },
  });

  // 筛选出需要抓取的链接（描述或 favicon 缺失）
  const pending = newLinks.filter(
    (l) => !l.description || !l.favicon
  );

  if (pending.length === 0) return;

  const concurrency = 3;
  for (let i = 0; i < pending.length; i += concurrency) {
    const batch = pending.slice(i, i + concurrency);
    await Promise.allSettled(
      batch.map(async (link) => {
        const meta = await recognizeUrl(link.url);
        if (!meta.title) return; // 抓取失败

        const updates: Record<string, string> = {};
        if (!link.description && meta.description) updates.description = meta.description;
        if (!link.favicon && meta.favicon) updates.favicon = meta.favicon;

        if (Object.keys(updates).length > 0) {
          await prisma.link.update({
            where: { id: link.id },
            data: updates,
          }).catch(() => {}); // 单条更新失败不影响其他
        }
      })
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const json = await request.json();
    const result = importSchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    const { data, format, categoryId } = result.data;
    let links: BookmarkLink[] = [];

    if (format === "html") {
      links = parseNetscapeBookmarks(data);
    } else if (format === "json") {
      try {
        const parsed = JSON.parse(data);
        links = extractLinksFromJson(parsed);
      } catch {
        return NextResponse.json({ error: "JSON 格式错误" }, { status: 400 });
      }
    }

    if (links.length === 0) {
      return NextResponse.json(
        { error: "没有找到可导入的链接" },
        { status: 400 }
      );
    }

    let targetCategoryId = categoryId;

    if (!targetCategoryId) {
      const defaultCategory = await prisma.category.findFirst({
        orderBy: { sortOrder: "asc" },
      });

      if (!defaultCategory) {
        const newCategory = await prisma.category.create({
          data: {
            name: "默认分类",
            sortOrder: 0,
            isPublic: true,
            userId: session.user.id,
          },
        });
        targetCategoryId = newCategory.id;
      } else {
        targetCategoryId = defaultCategory.id;
      }
    }

    // 验证目标分类是否允许写入
    const targetCat = await prisma.category.findUnique({
      where: { id: targetCategoryId },
      select: { id: true, isPublic: true, userId: true },
    });
    if (!targetCat) {
      return NextResponse.json({ error: "分类不存在" }, { status: 404 });
    }
    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "admin" && !targetCat.isPublic && targetCat.userId !== session.user.id) {
      return NextResponse.json({ error: "无权向此分类导入链接" }, { status: 403 });
    }

    const existingLinks = await prisma.link.findMany({
      where: { userId: session.user.id },
      select: { url: true },
    });
    const existingUrls = new Set(existingLinks.map((l) => l.url.toLowerCase()));

    const newLinks = links.filter(
      (link) => !existingUrls.has(link.url.toLowerCase())
    );

    if (newLinks.length === 0) {
      return NextResponse.json({
        imported: 0,
        skipped: links.length,
        message: "所有链接已存在",
      });
    }

    // 用户内全局编号，与创建接口/拖拽重排的编号体系一致
    const maxSortOrder = await prisma.link.aggregate({
      where: { userId: session.user.id },
      _max: { sortOrder: true },
    });

    const createdLinks = await prisma.link.createMany({
      data: newLinks.map((link, index) => ({
        title: link.title,
        url: cleanUrl(link.url),
        description: link.description,
        categoryId: targetCategoryId!,
        userId: session.user.id,
        sortOrder: (maxSortOrder._max.sortOrder ?? -1) + index + 1,
      })),
    });

    // 版本号在响应返回前递增完成：全实例缓存随版本键一起失效
    await incrementTableVersion("Category");
    await incrementTableVersion("Link");

    // 异步抓取元数据（标题、描述、favicon），不阻塞响应
    fetchMetadataForImported(session.user.id, targetCategoryId!, createdLinks.count)
      .catch((e) => console.warn("[import] 元数据抓取失败:", e));

    return NextResponse.json({
      imported: createdLinks.count,
      skipped: links.length - createdLinks.count,
      message: `成功导入 ${createdLinks.count} 个链接`,
    });
  } catch (error) {
    console.error("Failed to import:", error);
    return NextResponse.json(
      { error: "导入失败" },
      { status: 500 }
    );
  }
}
