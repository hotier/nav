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

/**
 * 读取栅格图的真实像素宽高 —— 只解析文件头，不解码像素、不依赖原生库。
 *
 * 替代原先的 sharp.metadata()：sharp 会把 19MB 的 libvips 原生库拖进产物，
 * 实测占 /api/favicon 函数包的 98%（95.87MB 里 94.34MB 是 @img+sharp），
 * 而这里真正需要的只是宽高两个数字，用于识别 1×1 之类的占位图。
 *
 * 覆盖 PNG / JPEG / GIF / WebP（VP8 / VP8L / VP8X）/ ICO；
 * 无法识别或数据不完整时返回 null，由调用方按"放行"处理（零误伤）。
 */
export function readImageSize(
  buffer: Uint8Array
): { width: number; height: number } | null {
  if (buffer.length < 12) return null;
  const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  // PNG：8 字节签名 + IHDR 块长度(4) + "IHDR"(4) → 宽(4)、高(4)，大端
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    if (buffer.length < 24) return null;
    return { width: dv.getUint32(16, false), height: dv.getUint32(20, false) };
  }

  // GIF："GIF8" + 版本(3) → 宽(2)、高(2)，小端
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
  }

  // JPEG：顺序遍历段标记，命中 SOFn 后取其后的高、宽（大端）
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      // 无长度字段的独立标记（SOI / TEM / RSTn）
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const length = dv.getUint16(offset + 2, false);
      // SOF0~SOF15，排除 DHT(0xC4) / JPG(0xC8) / DAC(0xCC)
      const isSOF =
        marker >= 0xc0 && marker <= 0xcf &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF) {
        return {
          height: dv.getUint16(offset + 5, false),
          width: dv.getUint16(offset + 7, false),
        };
      }
      if (length <= 0) return null;
      offset += 2 + length;
    }
    return null;
  }

  // WebP："RIFF"(4) + 文件长度(4) + "WEBP"(4) + 块类型(4)
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    const fmt = String.fromCharCode(buffer[12], buffer[13], buffer[14], buffer[15]);
    // VP8X（扩展型）：画布宽高各 3 字节小端，存的是实际值 -1
    if (fmt === "VP8X" && buffer.length >= 30) {
      const width = 1 + dv.getUint8(24) + (dv.getUint8(25) << 8) + (dv.getUint8(26) << 16);
      const height = 1 + dv.getUint8(27) + (dv.getUint8(28) << 8) + (dv.getUint8(29) << 16);
      return { width, height };
    }
    // VP8（有损）：帧头之后 2 字节宽、2 字节高，低 14 位有效
    if (fmt === "VP8 " && buffer.length >= 30) {
      return {
        width: dv.getUint16(26, true) & 0x3fff,
        height: dv.getUint16(28, true) & 0x3fff,
      };
    }
    // VP8L（无损）：1 字节签名后紧接 14 位宽 + 14 位高（位域，低位在前）
    if (fmt === "VP8L" && buffer.length >= 25) {
      const bits = dv.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    return null;
  }

  // ICO：头部 6 字节后是首个目录项，宽、高各 1 字节（0 表示 256）
  if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) {
    const width = buffer[6] === 0 ? 256 : buffer[6];
    const height = buffer[7] === 0 ? 256 : buffer[7];
    return { width, height };
  }

  return null;
}
