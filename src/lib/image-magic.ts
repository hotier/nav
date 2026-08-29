/**
 * 图片字节级判断工具：通过文件头魔数识别常见图片格式。
 * 供 /api/favicon 代理与 favicon 有效性探测（lib/probe-image.ts）复用。
 */

/** 通过文件头魔数判断是否为图片 */
export function isImageMagicBytes(buffer: Uint8Array): boolean {
  if (buffer.length < 4) return false;
  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return true;
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  // GIF
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return true;
  // WebP
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return true;
  // ICO
  if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) return true;
  // SVG：宽松匹配（前 250 字节内出现 <svg 或 <?xml，兼容注释/BOM/前导空白开头）
  const head = new TextDecoder().decode(buffer.slice(0, 250)).toLowerCase().trim();
  if (head.startsWith("<?xml") || head.startsWith("<svg") || head.includes("<svg")) return true;

  return false;
}

/** 根据文件魔数反向推导 content-type；无法识别返回空串由调用方兜底 */
export function guessImageContentType(buffer: Uint8Array): string {
  if (buffer.length >= 4) {
    if (buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
    if (buffer[0] === 0x47 && buffer[1] === 0x49) return "image/gif";
    if (buffer[0] === 0x00 && buffer[1] === 0x00) return "image/x-icon";
  }
  return "";
}
