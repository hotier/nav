import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import axios from "axios";
import * as cheerio from "cheerio";

// 补全相对路径为绝对 URL
function resolveUrl(href: string, base: URL): string {
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) return href;         // 已是绝对 URL
  if (href.startsWith("//")) return base.protocol + href; // 协议相对
  if (href.startsWith("/")) return base.origin + href;   // 绝对路径
  return base.origin + "/" + href;                       // 相对路径
}

export async function POST(request: Request) {
  // 鉴权
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const { url } = await request.json();
  if (!url) {
    return NextResponse.json({ error: "URL不能为空" }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: "无效的URL格式" }, { status: 400 });
  }

  try {
    // 1. 用 axios 带 UA 请求目标网页（5s 超时）
    const { data: html } = await axios.get<string>(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
      timeout: 5000,
      responseType: "text",
      maxRedirects: 5,
    });

    // 2. cheerio 解析 HTML
    const $ = cheerio.load(html);

    // 3. 按最优顺序提取

    // title → og:title → document.title
    let title =
      $("title").first().text().trim() ||
      $('meta[property="og:title"]').attr("content")?.trim() ||
      "";

    // description → og:description → meta description
    let description =
      $('meta[property="og:description"]').attr("content")?.trim() ||
      $('meta[name="description"]').attr("content")?.trim() ||
      "";

    // favicon → apple-touch-icon → og:image → link icon → 兜底 favicon.ico
    let favicon =
      $('link[rel="apple-touch-icon"]').attr("href")?.trim() ||
      $('link[rel="apple-touch-icon-precomposed"]').attr("href")?.trim() ||
      $('meta[property="og:image"]').attr("content")?.trim() ||
      "";

    // link icon（匹配 rel 中包含 "icon" 的 link 标签，按顺序取第一个）
    if (!favicon) {
      $("link[rel]").each((_, el) => {
        const rel = ($(el).attr("rel") || "").toLowerCase();
        if (rel.includes("icon") && !favicon) {
          favicon = $(el).attr("href")?.trim() || "";
        }
      });
    }

    // 兜底 /favicon.ico
    if (!favicon) {
      favicon = "/favicon.ico";
    }

    // 4. 自动补全相对路径为绝对 URL
    favicon = resolveUrl(favicon, parsedUrl);

    return NextResponse.json({ title, description, favicon });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
        return NextResponse.json({ error: "获取网页信息超时" }, { status: 504 });
      }
      if (error.response) {
        return NextResponse.json(
          { error: `目标网站返回错误 ${error.response.status}` },
          { status: 400 }
        );
      }
    }
    console.error("Link info recognition error:", error);
    return NextResponse.json({ error: "获取网页信息失败" }, { status: 500 });
  }
}
