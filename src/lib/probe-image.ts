import sharp from "sharp";
import { isImageMagicBytes } from "@/lib/image-magic";

export type FaviconRejectReason = "not-found" | "not-image" | "too-small";

export type ProbeImageResult =
  | { ok: true }
  | { ok: false; reason: FaviconRejectReason };

interface ProbeImageOptions {
  /** 栅格图最小边长（px），宽或高小于该值视为"空图标/占位图"；SVG 矢量图不设限 */
  minSize?: number;
  /** 探测超时（ms）。超时/网络异常按"有效"保守放行，避免误伤慢站点 */
  timeoutMs?: number;
}

/**
 * 探测一个图标 URL 是否可用：
 * - 打不开（非 2xx）→ not-found
 * - 内容不是图片（content-type 与魔数均不匹配）→ not-image
 * - 是图片但尺寸过小（如 1×1 透明占位图）→ too-small
 * - 网络异常 / 超时 / 无法解码格式（SVG、ICO 等）→ 视为有效（零误伤）
 */
export async function probeImageUrl(
  url: string,
  opts: ProbeImageOptions = {}
): Promise<ProbeImageResult> {
  const { minSize = 16, timeoutMs = 5000 } = opts;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // 网络异常/超时：无法确认，保守视为有效
    return { ok: true };
  }

  if (!res.ok) return { ok: false, reason: "not-found" };

  const buffer = new Uint8Array(await res.arrayBuffer());
  const contentType = (res.headers.get("content-type") || "").toLowerCase();

  const looksLikeImage =
    contentType.startsWith("image/") || contentType.includes("svg") || isImageMagicBytes(buffer);
  if (!looksLikeImage) return { ok: false, reason: "not-image" };

  // SVG 是矢量图，无"尺寸过小"概念，直接放行
  const head = new TextDecoder().decode(buffer.slice(0, 500)).toLowerCase().trim();
  if (head.startsWith("<?xml") || head.startsWith("<svg") || head.includes("<svg")) {
    return { ok: true };
  }

  // 栅格图：用 sharp 解码读取真实尺寸，过滤 1×1 等占位图
  try {
    const meta = await sharp(buffer, { failOn: "none" }).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w > 0 && h > 0 && (w < minSize || h < minSize)) {
      return { ok: false, reason: "too-small" };
    }
  } catch {
    // sharp 无法解码的格式（如部分 ICO/GIF 变体）：跳过尺寸判断，放行
  }

  return { ok: true };
}
