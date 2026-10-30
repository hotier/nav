/**
 * 通用加密工具 —— 只用 Web Crypto，保证 Node 与 Cloudflare Workers 行为一致。
 * 禁止 node:crypto / Buffer。
 */

/** 生成 n 位纯数字验证码（拒绝采样，避免取模偏差） */export function randomDigits(length = 6): string {
  const bound = 10 ** length;
  const limit = 0x1_0000_0000 - (0x1_0000_0000 % bound);
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return String(value % bound).padStart(length, "0");
}

/** 随机字节的 base64（用于本地开发临时密钥） */
export function randomBase64(byteLength = 32): string {
  let binary = "";
  for (const byte of crypto.getRandomValues(new Uint8Array(byteLength))) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** 字节 → base64（btoa 只接受字符串，分块避免参数过多） */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** base64 → 字节 */
export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** SHA-256 摘要的 base64（用于把任意长度密钥派生为固定 32 字节会话密钥） */
export async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/** HMAC-SHA256，返回小写十六进制 */
export async function hmacSha256Hex(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return toHex(new Uint8Array(signature));
}

/** 恒定时间字符串比较（避免签名逐字节泄露） */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function encodeBase64Url(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeBase64Url(value: string): string | null {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
