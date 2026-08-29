import axios from "axios";
import * as cheerio from "cheerio";
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

// 补全相对路径为绝对 URL
function resolveUrl(href: string, base: URL): string {
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) return href;         // 已是绝对 URL
  if (href.startsWith("//")) return base.protocol + href; // 协议相对
  if (href.startsWith("/")) return base.origin + href;   // 绝对路径
  return base.origin + "/" + href;                       // 相对路径
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

  // HTML 抓取与 faviconsnap 并行执行，避免串行导致识别超时。
  // favicon 以 faviconsnap 引擎为首要方式；HTML 提取作为降级。
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

      const $ = cheerio.load(html);

      const title =
        $("title").first().text().trim() ||
        $('meta[property="og:title"]').attr("content")?.trim() ||
        "";

      const description =
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

      if (favicon) favicon = resolveUrl(favicon, parsedUrl);

      return { title, description, favicon };
    } catch {
      // 抓取失败
      return { title: "", description: "", favicon: "" };
    }
  })();

  // 整体硬超时：即使外部站点极慢，识别也不会无限等待，保证接口及时响应
  const htmlResult = await Promise.race([
    htmlPromise,
    new Promise<{ title: string; description: string; favicon: string }>((_, reject) =>
      setTimeout(() => reject(new Error("识别超时")), 12000)
    ),
  ]).catch(() => ({ title: "", description: "", favicon: "" }));

  // favicon 优先使用 faviconsnap 中转 URL（faviconsnap 负责判断站点、转中图片 + 缓存），
  // 仅 HTML 抓取不到时降级用 faviconsnap 中转（faviconsnap 对绝大多数站点都有兜底）
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
