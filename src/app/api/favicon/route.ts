/**
 * 服务端图片代理 — 统一通过服务端请求外部图片（图标、头像等）
 * GET /api/favicon?url=<encoded_url>
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return new Response(null, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return new Response(null, { status: res.status });
    }

    // 先取 buffer，再根据 magic bytes 判断是否为图片（兼容 application/octet-stream 等非标准 content-type）
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "";

    // 只要内容以图片魔数开头，就按图片返回
    const isImage = (
      contentType.startsWith("image/") ||
      isImageMagicBytes(buffer)
    );

    if (!isImage) {
      return new Response(null, { status: 404 });
    }

    // 如果是已知的 icon 类型但 content-type 不标准，修正 content-type
    const finalContentType = contentType.startsWith("image/")
      ? contentType
      : guessImageContentType(buffer);

    return new Response(buffer, {
      headers: {
        "Content-Type": finalContentType,
        // 缓存 1 天，同一图标不重复请求
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
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
  // SVG (text 开头，检测 <?xml 或 <svg)
  const head = new TextDecoder().decode(u8.slice(0, 5)).toLowerCase();
  if (head.startsWith("<?xml") || head.startsWith("<svg") || head.startsWith("<svg ")) return true;

  return false;
}

/** 根据文件魔数反向推导 content-type */
function guessImageContentType(buffer: ArrayBuffer): string {
  const u8 = new Uint8Array(buffer);
  if (u8.length >= 4) {
    if (u8[0] === 0x89 && u8[1] === 0x50) return "image/png";
    if (u8[0] === 0xff && u8[1] === 0xd8) return "image/jpeg";
    if (u8[0] === 0x47 && u8[1] === 0x49) return "image/gif";
    if (u8[0] === 0x00 && u8[1] === 0x00) return "image/x-icon";
  }
  // 默认 fallback
  return "image/png";
}
