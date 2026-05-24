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
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return new Response(null, { status: res.status });
    }

    const contentType = res.headers.get("content-type") || "";
    // 非图片类型视为加载失败，触发客户端 onError 回退链
    if (!contentType.startsWith("image/")) {
      return new Response(null, { status: 404 });
    }

    const buffer = await res.arrayBuffer();

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        // 缓存 1 天，同一图标不重复请求
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
