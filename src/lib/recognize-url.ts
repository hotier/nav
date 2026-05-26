import axios from "axios";
import * as cheerio from "cheerio";

interface RecognizedMeta {
  title: string;
  description?: string;
  favicon?: string;
}

/**
 * 清理 URL：去除首尾空白、零宽字符、尾部多余反斜杠。
 * 保留协议部分的 `://` 不受影响。
 */
export function cleanUrl(raw: string): string {
  if (!raw) return "";
  let url = raw
    .trim()
    // 去除零宽字符等不可见字符
    .replace(/[\u200B-\u200D\uFEFF]/g, "");

  // 去除路径尾部的反斜杠，但不影响协议中的 ://
  const protoEnd = url.indexOf("://");
  if (protoEnd !== -1) {
    const rest = url.slice(protoEnd + 3);
    // 只清理路径部分多余的 /，至少保留一个
    const cleanedRest = rest.replace(/\/+$/, "");
    url = url.slice(0, protoEnd + 3) + (cleanedRest || "");
  }
  return url;
}

// 补全相对路径为绝对 URL
function resolveUrl(href: string, base: URL): string {
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) return href;         // 已是绝对 URL
  if (href.startsWith("//")) return base.protocol + href; // 协议相对
  if (href.startsWith("/")) return base.origin + href;   // 绝对路径
  return base.origin + "/" + href;                       // 相对路径
}

/**
 * 从目标 URL 的 HTML 中解析标题、描述、favicon。
 * 失败时返回空对象（不抛异常）。
 */
export async function recognizeUrl(url: string): Promise<RecognizedMeta> {
  const cleanedUrl = cleanUrl(url);
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(cleanedUrl);
  } catch {
    return { title: "" };
  }

  try {
    const { data: html } = await axios.get<string>(cleanedUrl, {
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

    const $ = cheerio.load(html);

    let title =
      $("title").first().text().trim() ||
      $('meta[property="og:title"]').attr("content")?.trim() ||
      "";

    let description =
      $('meta[property="og:description"]').attr("content")?.trim() ||
      $('meta[name="description"]').attr("content")?.trim() ||
      "";

    let favicon =
      $('link[rel="apple-touch-icon"]').attr("href")?.trim() ||
      $('link[rel="apple-touch-icon-precomposed"]').attr("href")?.trim() ||
      $('meta[property="og:image"]').attr("content")?.trim() ||
      "";

    if (!favicon) {
      $("link[rel]").each((_, el) => {
        const rel = ($(el).attr("rel") || "").toLowerCase();
        if (rel.includes("icon") && !favicon) {
          favicon = $(el).attr("href")?.trim() || "";
        }
      });
    }

    if (!favicon) {
      favicon = "/favicon.ico";
    }

    favicon = resolveUrl(favicon, parsedUrl);

    return {
      title: title || "",
      description: description || undefined,
      favicon: favicon || undefined,
    };
  } catch {
    // 抓取失败静默返回空标题（调用方自行决定如何兜底）
    return { title: "" };
  }
}
