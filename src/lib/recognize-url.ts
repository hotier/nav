import axios from "axios";
import { RECOG_CACHE_PREFIX, getRedis } from "@/lib/redis";

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

/** 解码常见 HTML 实体（含十进制 / 十六进制数字实体）。 */
function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => fromCodePoint(Number(dec)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => fromCodePoint(parseInt(hex, 16)));
}

function fromCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/** 取 <head> 片段；无 head 标签时回退全文前 200KB，避免正文/脚本干扰。 */
function extractHead(html: string): string {
  const m = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  return m ? m[1] : html.slice(0, 200_000);
}

/** 取 <title> 文本。 */
function extractTitle(head: string): string {
  const m = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : "";
}

/**
 * 按 name / property 取 <meta> 的 content。
 * 逐个 <meta> 标签匹配，因此 content 写在 name/property 前后都能正确识别。
 */
function extractMetaContent(
  head: string,
  attr: "name" | "property",
  key: string
): string {
  const tagRe = /<meta\b[^>]*>/gi;
  const attrRe = new RegExp(`\\b${attr}\\s*=\\s*["']?([^"'\\s>]+)["']?`, "i");
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(head))) {
    const attrMatch = m[0].match(attrRe);
    if (!attrMatch || attrMatch[1].toLowerCase() !== key.toLowerCase()) continue;
    const contentMatch = m[0].match(/\bcontent\s*=\s*["']([^"']*)["']/i);
    if (contentMatch) {
      return decodeEntities(contentMatch[1]).replace(/\s+/g, " ").trim();
    }
  }
  return "";
}

/**
 * 直接拼接 faviconsnap 图片接口 URL 作为 favicon 中转地址。
 * faviconsnap 会自行判断站点、转中图片并带缓存，前端可直接作为 <img> src，
 * 无需再经过本地 /api/favicon 代理，也无需额外请求确认。
 * size=64：卡片展示 40px，64 保证高分屏清晰（API 支持 16/32/64/128）。
 */
function buildFaviconProxyUrl(url: string): string {
  // 只保留站点域名（去掉路径/查询/hash），faviconsnap 按域名识别站点图标最准确
  let root = url;
  try {
    root = new URL(url).origin;
  } catch {
    // URL 解析失败则原样使用
  }
  return `https://faviconsnap.com/api/favicon?url=${root}&size=64`;
}

/**
 * 从目标 URL 的 HTML 中解析标题、描述；favicon 由 faviconsnap 中转生成。
 * 失败时返回空对象（不抛异常）。
 *
 * 说明：这里刻意不使用 cheerio。cheerio 会连带引入 iconv-lite（GBK/Big5/
 * Shift_JIS 等编码表）与 whatwg-encoding，实测给 Serverless 页面包增加约
 * 0.9MB；而本函数只需要取 title 与 description 两个字符串，正则即可等价实现。
 */
export async function recognizeUrl(url: string): Promise<RecognizedMeta> {
  const cleanedUrl = cleanUrl(url);
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(cleanedUrl);
  } catch {
    return { title: "" };
  }

  // 按域名缓存识别结果（跨用户共享，同一站点的标题/描述/图标基本不变）。
  // 仅 Redis 模式生效；缓存错误一律吞掉，回退到真实抓取。
  const client = getRedis();
  const cacheKey = RECOG_CACHE_PREFIX + parsedUrl.origin;
  if (client) {
    try {
      const cached = await client.get<RecognizedMeta>(cacheKey);
      if (cached && (cached.title || cached.favicon)) return cached;
    } catch {
      // 忽略缓存异常，走真实抓取
    }
  }

  // 抓取 HTML 解析标题/描述（favicon 由 faviconsnap 生成，无需从 HTML 提取）。
  const htmlPromise = (async () => {
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

      const head = extractHead(html);

      const title =
        extractTitle(head) ||
        extractMetaContent(head, "property", "og:title") ||
        "";

      const description =
        extractMetaContent(head, "property", "og:description") ||
        extractMetaContent(head, "name", "description") ||
        "";

      return { title, description };
    } catch {
      // 抓取失败
      return { title: "", description: "" };
    }
  })();

  // 整体硬超时：即使外部站点极慢，识别也不会无限等待，保证接口及时响应
  const htmlResult = await Promise.race([
    htmlPromise,
    new Promise<{ title: string; description: string }>((_, reject) =>
      setTimeout(() => reject(new Error("识别超时")), 12000)
    ),
  ]).catch(() => ({ title: "", description: "" }));

  // favicon 统一使用 faviconsnap 中转 URL（faviconsnap 负责识别站点、转中图 + 缓存），
  // 前端可直接作为 <img> src，无需再经过本地 /api/favicon 代理
  const favicon = buildFaviconProxyUrl(cleanedUrl);

  const result: RecognizedMeta = {
    title: htmlResult.title || "",
    description: htmlResult.description || undefined,
    favicon: favicon || undefined,
  };

  // 识别成功（有标题或图标）才写缓存；失败不缓存，下次仍可重试
  if (client && (result.title || result.favicon)) {
    try {
      await client.set(cacheKey, JSON.stringify(result), { ex: 7 * 86400 });
    } catch {
      // 写缓存失败不影响本次响应
    }
  }

  return result;
}
