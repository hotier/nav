import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateAll } from "@/lib/queries";
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
    const url = match[1];
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
      url: String(item.url || item.link || ""),
      description: String(item.description || item.desc || ""),
    })).filter((item) => item.url);
  }

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;

    // 格式2: 本系统导出的 { version, exportedAt, categories, links }
    if (Array.isArray(obj.links)) {
      return (obj.links as Array<Record<string, unknown>>).map((item) => ({
        title: String(item.title || item.name || "Untitled"),
        url: String(item.url || ""),
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
          },
        });
        targetCategoryId = newCategory.id;
      } else {
        targetCategoryId = defaultCategory.id;
      }
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

    const maxSortOrder = await prisma.link.aggregate({
      where: { categoryId: targetCategoryId, userId: session.user.id },
      _max: { sortOrder: true },
    });

    const createdLinks = await prisma.link.createMany({
      data: newLinks.map((link, index) => ({
        title: link.title,
        url: link.url,
        description: link.description,
        categoryId: targetCategoryId!,
        userId: session.user.id,
        sortOrder: (maxSortOrder._max.sortOrder ?? -1) + index + 1,
      })),
    });

    // 导入完成后清除所有缓存，确保分类和链接列表都能获取到最新数据
    invalidateAll();

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
