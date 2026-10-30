/** 客户端可用的 URL 清理（与服务端 cleanUrl 同口径，避免把服务端依赖带进浏览器包） */
export function cleanUrl(raw: string): string {
  if (!raw) return "";
  let url = raw.trim().replace(/[\u200B-\u200D\uFEFF]/g, "");

  const protoEnd = url.indexOf("://");
  if (protoEnd !== -1) {
    const rest = url.slice(protoEnd + 3);
    const cleanedRest = rest.replace(/\/+$/, "");
    url = url.slice(0, protoEnd + 3) + cleanedRest;
  }
  return url;
}

/** 通过服务端 /api/favicon 代理加载外部图片 */
export function proxyImageUrl(url: string, size?: number): string {
  const base = `/api/favicon?url=${encodeURIComponent(url)}`;
  return size ? `${base}&size=${size}` : base;
}

export type HighlightPart = { text: string; match: boolean };

/** 拆分文本用于高亮：返回纯文本片段，由模板渲染 <mark>，不使用 v-html（避免 XSS） */
export function highlightParts(text: string, query?: string): HighlightPart[] {
  if (!query?.trim()) return [{ text, match: false }];
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${esc})`, "gi");
  return text
    .split(regex)
    .filter((part) => part !== "")
    .map((part) => ({ text: part, match: part.toLowerCase() === query.toLowerCase() }));
}
