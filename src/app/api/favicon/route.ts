import { ICON_CACHE_PREFIX, getRedis } from "@/lib/redis";
import { isImageMagicBytes, guessImageContentType } from "@/lib/image-magic";
import sharp from "sharp";

/**
 * 服务端图片代理 — 统一通过服务端请求外部图片（图标、头像等）
 * GET /api/favicon?url=<encoded_url>[&size=<像素>]
 *
 * 设计要点：
 * - 伪装完整浏览器头（UA + Referer 指向目标站自身 + Accept），降低防盗链拒绝率
 * - 内容判定：content-type 优先，其次魔数；SVG 因常见 text/xml / 注释头等形态需宽松匹配
 * - 失败不静默：console.warn 记录目标与原因，便于诊断"URL 明明能访问却显示默认图标"
 * - size（可选）：头像等场景传入目标最长边像素（8~1024），用 sharp 等比缩小（只缩不放），
 *   降低传输体积与客户端解码开销；仅对静态栅格图 PNG/JPEG/WebP 生效，
 *   GIF 动图 / SVG 矢量 / ICO 多尺寸容器原样透传。缩小失败自动回退原图。
 *
 * 缓存：启用 Redis 时按「完整 URL + size」缓存图片字节（头像/图标同域名不同内容，不能按域名键），
 * TTL 7 天；超过 400KB 的图片不缓存（Upstash REST 单请求上限 1MB，base64 膨胀需留余量）。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const rawSize = searchParams.get("size");
  // 可选参数：目标最长边像素（8~1024），用于把头像等比缩小到显示尺寸
  const size = rawSize ? Number(rawSize) : 0;

  if (!url) {
    return new Response(null, { status: 400 });
  }
  if (size && (!Number.isInteger(size) || size < 8 || size > 1024)) {
    return new Response(null, { status: 400 });
  }

  let referer: string | undefined;
  try {
    const target = new URL(url);
    // 以目标站自身作为 Referer，模拟站内访问，绕过常见防盗链
    referer = `${target.protocol}//${target.host}/`;
  } catch {
    return new Response(null, { status: 400 });
  }

  // Redis 图片字节缓存：命中直接返回，避免每次回源外部站点
  // 缓存错误一律吞掉，回退到真实抓取
  const client = getRedis();
  // 缓存 key 含 size：同一 URL 的原始图与缩放图互不污染
  const cacheKey = ICON_CACHE_PREFIX + url + (size ? `@${size}` : "");
  if (client) {
    try {
      const cached = await client.get<{ ct: string; b64: string }>(cacheKey);
      if (cached?.b64 && cached.ct) {
        return new Response(Buffer.from(cached.b64, "base64"), {
          headers: {
            "Content-Type": cached.ct,
            "Cache-Control": "public, max-age=86400, immutable",
          },
        });
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
        "Accept": "image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.8",
        ...(referer ? { Referer: referer } : {}),
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[favicon] 上游返回 ${res.status}: ${url}`);
      return new Response(null, { status: res.status });
    }

    // 先取 buffer，再根据 magic bytes 判断是否为图片（兼容 application/octet-stream 等非标准 content-type）
    const buffer = await res.arrayBuffer();
    const contentType = (res.headers.get("content-type") || "").toLowerCase();

    // 只要内容以图片魔数开头（或可识别为 SVG），就按图片返回
    const isImage = (
      contentType.startsWith("image/") ||
      contentType.includes("svg") ||
      isImageMagicBytes(new Uint8Array(buffer))
    );

    if (!isImage) {
      console.warn(`[favicon] 非图片内容（content-type=${contentType || "无"}）: ${url}`);
      return new Response(null, { status: 404 });
    }

    // 如果是已知的 icon 类型但 content-type 不标准，修正 content-type
    const finalContentType = contentType.startsWith("image/")
      ? contentType
      : guessImageContentType(new Uint8Array(buffer)) || (contentType.includes("svg") ? "image/svg+xml" : "image/png");

    // 可选：按 size 等比缩小（仅静态栅格图 PNG/JPEG/WebP；GIF 动图/SVG 矢量/ICO 原样透传）
    let outBuffer: Buffer | ArrayBuffer = buffer;
    if (size && isResizableRaster(finalContentType)) {
      try {
        outBuffer = await sharp(buffer)
          .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
          .toBuffer();
      } catch (err) {
        console.warn(`[favicon] 图片缩放失败，回退原图: ${url}`, (err as Error).message);
        outBuffer = buffer;
      }
    }

    // 图片字节写入 Redis 缓存（≤400KB 才缓存：base64 膨胀 + JSON 包裹后需在 Upstash 1MB 限制内）
    if (client && outBuffer.byteLength < 400 * 1024) {
      try {
        const cacheBuf = Buffer.isBuffer(outBuffer) ? outBuffer : Buffer.from(outBuffer);
        await client.set(
          cacheKey,
          JSON.stringify({ ct: finalContentType, b64: cacheBuf.toString("base64") }),
          { ex: 7 * 86400 }
        );
      } catch {
        // 写缓存失败不影响本次响应
      }
    }

    return new Response(outBuffer, {
      headers: {
        "Content-Type": finalContentType,
        // 缓存 1 天，同一图标不重复请求
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (err) {
    console.warn(`[favicon] 代理失败: ${url}`, (err as Error).message);
    return new Response(null, { status: 502 });
  }
}

/** 是否可用 sharp 等比缩小的静态栅格图（动图/矢量/多尺寸容器不做处理） */
function isResizableRaster(ct: string): boolean {
  return ct === "image/png" || ct === "image/jpeg" || ct === "image/webp";
}
