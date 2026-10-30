import { ICON_CACHE_PREFIX, getRedis } from "~~/server/utils/redis";
import { isImageMagicBytes, guessImageContentType } from "~~/server/utils/image-magic";
import { base64ToBytes, bytesToBase64 } from "~~/server/utils/crypto";

/**
 * 服务端图片代理 — 统一通过服务端请求外部图片（图标、头像等）
 * GET /api/favicon?url=<encoded_url>[&size=<像素>]
 *
 * - 伪装完整浏览器头（UA + Referer 指向目标站自身 + Accept），降低防盗链拒绝率
 * - 内容判定：content-type 优先，其次魔数；SVG 需宽松匹配
 * - 启用 Redis 时按「完整 URL + size」缓存图片字节，TTL 7 天；>400KB 不缓存
 *   （Upstash REST 单请求上限 1MB，base64 膨胀需留余量）
 */
export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  const url = typeof q.url === "string" ? q.url : "";
  const size = q.size ? Number(q.size) : 0;

  if (!url) {
    setResponseStatus(event, 400);
    return null;
  }
  if (size && (!Number.isInteger(size) || size < 8 || size > 1024)) {
    setResponseStatus(event, 400);
    return null;
  }

  let referer: string;
  try {
    const target = new URL(url);
    // 以目标站自身作为 Referer，模拟站内访问，绕过常见防盗链
    referer = `${target.protocol}//${target.host}/`;
  } catch {
    setResponseStatus(event, 400);
    return null;
  }

  const client = getRedis();
  const cacheKey = ICON_CACHE_PREFIX + url + (size ? `@${size}` : "");
  if (client) {
    try {
      const cached = await client.get<{ ct: string; b64: string }>(cacheKey);
      if (cached?.b64 && cached.ct) {
        setResponseHeaders(event, {
          "Content-Type": cached.ct,
          "Cache-Control": "public, max-age=86400, immutable",
        });
        return base64ToBytes(cached.b64);
      }
    } catch {
      // 忽略缓存异常
    }
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.8",
        Referer: referer,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[favicon] 上游返回 ${res.status}: ${url}`);
      setResponseStatus(event, res.status);
      return null;
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    const contentType = (res.headers.get("content-type") || "").toLowerCase();

    const isImage =
      contentType.startsWith("image/") || contentType.includes("svg") || isImageMagicBytes(bytes);
    if (!isImage) {
      console.warn(`[favicon] 非图片内容（content-type=${contentType || "无"}）: ${url}`);
      setResponseStatus(event, 404);
      return null;
    }

    const finalContentType = contentType.startsWith("image/")
      ? contentType
      : guessImageContentType(bytes) ||
        (contentType.includes("svg") ? "image/svg+xml" : "image/png");

    if (client && bytes.byteLength < 400 * 1024) {
      try {
        await client.set(
          cacheKey,
          JSON.stringify({ ct: finalContentType, b64: bytesToBase64(bytes) }),
          { ex: 7 * 86400 },
        );
      } catch {
        // 写缓存失败不影响本次响应
      }
    }

    setResponseHeaders(event, {
      "Content-Type": finalContentType,
      "Cache-Control": "public, max-age=86400, immutable",
    });
    return bytes;
  } catch (err) {
    console.warn(`[favicon] 代理失败: ${url}`, (err as Error).message);
    setResponseStatus(event, 502);
    return null;
  }
});
