/**
 * 服务端图片代理 — 统一通过服务端请求外部图片（图标、头像等）
 * GET /api/favicon?url=<encoded_url>
 *
 * 设计要点：
 * - 伪装完整浏览器头（UA + Referer 指向目标站自身 + Accept），降低防盗链拒绝率
 * - 内容判定：content-type 优先，其次魔数；SVG 因常见 text/xml / 注释头等形态需宽松匹配
 * - 失败不静默：console.warn 记录目标与原因，便于诊断"URL 明明能访问却显示默认图标"
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
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
      isImageMagicBytes(buffer)
    );

    if (!isImage) {
      console.warn(`[favicon] 非图片内容（content-type=${contentType || "无"}）: ${url}`);
      return new Response(null, { status: 404 });
    }

    // 如果是已知的 icon 类型但 content-type 不标准，修正 content-type
    const finalContentType = contentType.startsWith("image/")
      ? contentType
      : guessImageContentType(buffer) || (contentType.includes("svg") ? "image/svg+xml" : "image/png");

    return new Response(buffer, {
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

/** 通过文件头魔数判断是否为图片 */
function isImageMagicBytes(buffer: ArrayBuffer): boolean {
  const u8 = new Uint8Array(buffer);
  if (u8.length < 4) return false;
  // PNG
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return true;
  // JPEG
  if (u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return true;
  // GIF
  if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x38) return true;
  // WebP
  if (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 &&
      u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50) return true;
  // ICO
  if (u8[0] === 0x00 && u8[1] === 0x00 && u8[2] === 0x01 && u8[3] === 0x00) return true;
  // SVG：宽松匹配（前 250 字节内出现 <svg 或 <?xml，兼容注释/BOM/前导空白开头）
  const head = new TextDecoder().decode(u8.slice(0, 250)).toLowerCase().trim();
  if (head.startsWith("<?xml") || head.startsWith("<svg") || head.includes("<svg")) return true;

  return false;
}

/** 根据文件魔数反向推导 content-type；无法识别返回空串由调用方兜底 */
function guessImageContentType(buffer: ArrayBuffer): string {
  const u8 = new Uint8Array(buffer);
  if (u8.length >= 4) {
    if (u8[0] === 0x89 && u8[1] === 0x50) return "image/png";
    if (u8[0] === 0xff && u8[1] === 0xd8) return "image/jpeg";
    if (u8[0] === 0x47 && u8[1] === 0x49) return "image/gif";
    if (u8[0] === 0x00 && u8[1] === 0x00) return "image/x-icon";
  }
  return "";
}
