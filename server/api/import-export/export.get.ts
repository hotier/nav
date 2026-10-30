import { and, asc, desc, eq, or, type SQL } from "drizzle-orm";
import { getDb } from "~~/server/utils/db";
import { requireSession } from "~~/server/utils/session";
import { defineApiHandler, fail } from "~~/server/utils/api";
import { categories, links } from "~~/server/database/schema";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * GET /api/import-export/export?format=json|html&includePrivate=true
 *
 * 导出当前用户的链接；分类口径与可见性一致（公开含隐藏 + 自己的私有，
 * 普通用户再排除被管理员隐藏的内容）。两种格式都以附件下载返回。
 */
export default defineApiHandler(async (event) => {
  const session = await requireSession(event);

  const q = getQuery(event);
  const format = typeof q.format === "string" && q.format ? q.format : "json";
  const includePrivate = q.includePrivate === "true";

  try {
    const userRole = session.user.role ?? undefined;

    const linkConditions: Array<SQL | undefined> = [eq(links.userId, session.user.id)];
    if (!includePrivate) linkConditions.push(eq(links.isPrivate, false));
    // 普通用户导出时排除被管理员隐藏的内容；管理员导出全部（含隐藏）
    if (userRole !== "admin") linkConditions.push(eq(links.isHidden, false));

    // 分类导出口径与可见性一致：公开（含隐藏）+ 自己的私有；普通用户再排除被隐藏的
    const catConditions: Array<SQL | undefined> = [
      or(eq(categories.isPublic, true), eq(categories.userId, session.user.id)),
    ];
    if (userRole !== "admin") catConditions.push(eq(categories.isHidden, false));

    const db = getDb();
    const [categoryRows, linkRows] = await Promise.all([
      db
        .select()
        .from(categories)
        .where(and(...catConditions))
        .orderBy(asc(categories.sortOrder)),
      db
        .select({ link: links, categoryName: categories.name })
        .from(links)
        .innerJoin(categories, eq(links.categoryId, categories.id))
        .where(and(...linkConditions))
        .orderBy(asc(links.categoryId), desc(links.isPinned), asc(links.sortOrder)),
    ]);

    const exportLinks = linkRows.map((row) => ({
      ...row.link,
      category: { name: row.categoryName },
    }));
    const exportCategories = categoryRows.map((category) => ({
      ...category,
      children: categoryRows.filter((child) => child.parentId === category.id),
    }));

    if (format === "html") {
      let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`;

      for (const category of exportCategories) {
        const categoryLinks = exportLinks.filter((link) => link.categoryId === category.id);

        if (categoryLinks.length > 0 || category.children.length > 0) {
          html += `    <DT><H3>${escapeHtml(category.name)}</H3>\n`;
          html += `    <DL><p>\n`;

          for (const link of categoryLinks) {
            html += `        <DT><A HREF="${escapeHtml(link.url)}" ADD_DATE="${Math.floor(link.createdAt.getTime() / 1000)}">${escapeHtml(link.title)}</A>\n`;
          }

          for (const child of category.children) {
            const childLinks = exportLinks.filter((link) => link.categoryId === child.id);
            if (childLinks.length > 0) {
              html += `        <DT><H3>${escapeHtml(child.name)}</H3>\n`;
              html += `        <DL><p>\n`;
              for (const link of childLinks) {
                html += `            <DT><A HREF="${escapeHtml(link.url)}" ADD_DATE="${Math.floor(link.createdAt.getTime() / 1000)}">${escapeHtml(link.title)}</A>\n`;
              }
              html += `        </DL><p>\n`;
            }
          }

          html += `    </DL><p>\n`;
        }
      }

      html += `</DL><p>`;

      setResponseHeaders(event, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="onenav-bookmarks-${Date.now()}.html"`,
      });
      return html;
    }

    const exportData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      categories: exportCategories,
      links: exportLinks,
    };

    setResponseHeaders(event, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="onenav-export-${Date.now()}.json"`,
    });
    // 保留旧的 2 空格缩进输出（直接返回序列化后的字符串，避免 h3 再压缩）
    return JSON.stringify(exportData, null, 2);
  } catch (error) {
    console.error("Failed to export:", error);
    return fail(event, 500, "导出失败");
  }
});
