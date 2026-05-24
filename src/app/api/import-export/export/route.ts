import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "json";
    const includePrivate = searchParams.get("includePrivate") === "true";

    const where: Record<string, unknown> = { userId: session.user.id };
    if (!includePrivate) {
      where.isPrivate = false;
    }

    const [categories, links] = await Promise.all([
      prisma.category.findMany({
        include: { children: true },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.link.findMany({
        where,
        include: {
          category: {
            select: { name: true },
          },
        },
        orderBy: [{ categoryId: "asc" }, { isPinned: "desc" }, { sortOrder: "asc" }],
      }),
    ]);

    if (format === "html") {
      let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`;

      for (const category of categories) {
        const categoryLinks = links.filter(
          (link) => link.categoryId === category.id
        );

        if (categoryLinks.length > 0 || category.children?.length) {
          html += `    <DT><H3>${escapeHtml(category.name)}</H3>\n`;
          html += `    <DL><p>\n`;

          for (const link of categoryLinks) {
            html += `        <DT><A HREF="${escapeHtml(link.url)}" ADD_DATE="${Math.floor(new Date(link.createdAt).getTime() / 1000)}">${escapeHtml(link.title)}</A>\n`;
          }

          for (const child of category.children || []) {
            const childLinks = links.filter(
              (link) => link.categoryId === child.id
            );
            if (childLinks.length > 0) {
              html += `        <DT><H3>${escapeHtml(child.name)}</H3>\n`;
              html += `        <DL><p>\n`;
              for (const link of childLinks) {
                html += `            <DT><A HREF="${escapeHtml(link.url)}" ADD_DATE="${Math.floor(new Date(link.createdAt).getTime() / 1000)}">${escapeHtml(link.title)}</A>\n`;
              }
              html += `        </DL><p>\n`;
            }
          }

          html += `    </DL><p>\n`;
        }
      }

      html += `</DL><p>`;

      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `attachment; filename="onenav-bookmarks-${Date.now()}.html"`,
        },
      });
    }

    const exportData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      categories,
      links,
    };

    return new Response(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="onenav-export-${Date.now()}.json"`,
      },
    });
  } catch (error) {
    console.error("Failed to export:", error);
    return NextResponse.json(
      { error: "导出失败" },
      { status: 500 }
    );
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
