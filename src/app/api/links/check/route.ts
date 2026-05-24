import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateLinks } from "@/lib/queries";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const links = await prisma.link.findMany({
      where: { userId: session.user.id },
      select: { id: true, url: true },
    });

    const results = await Promise.allSettled(
      links.map(async (link) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
          const response = await fetch(link.url, {
            method: "HEAD",
            signal: controller.signal,
            redirect: "follow",
          });

          clearTimeout(timeoutId);

          return {
            id: link.id,
            url: link.url,
            status: response.ok ? "active" : "dead",
            statusCode: response.status,
          };
        } catch (err: unknown) {
          clearTimeout(timeoutId);
          // 超时
          if (err instanceof DOMException && err.name === "AbortError") {
            return {
              id: link.id,
              url: link.url,
              status: "timeout",
              statusCode: 0,
            };
          }
          // DNS 解析失败、连接拒绝、SSL 错误等
          return {
            id: link.id,
            url: link.url,
            status: "dead",
            statusCode: 0,
          };
        }
      })
    );

    const checkedLinks = results.map((result) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      return {
        id: "unknown",
        url: "",
        status: "error" as const,
        statusCode: 0,
      };
    });

    await Promise.all(
      checkedLinks
        .filter((r) => r.id !== "unknown")
        .map((r) =>
          prisma.link.update({
            where: { id: r.id },
            data: { status: r.status },
          })
        )
    );

    invalidateLinks(session.user.id);

    const activeCount = checkedLinks.filter((r) => r.status === "active").length;
    const deadCount = checkedLinks.filter((r) => r.status === "dead").length;
    const timeoutCount = checkedLinks.filter((r) => r.status === "timeout").length;

    return NextResponse.json({
      total: checkedLinks.length,
      active: activeCount,
      dead: deadCount,
      timeout: timeoutCount,
      results: checkedLinks,
    });
  } catch (error) {
    console.error("Link detection error:", error);
    return NextResponse.json(
      { error: "检测失败" },
      { status: 500 }
    );
  }
}
