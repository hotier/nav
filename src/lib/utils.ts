import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 通过服务端 /api/favicon 代理加载外部图片，避免客户端直接请求外部 URL；size 可选，用于把头像等比缩小到目标最长边 */
export function proxyImageUrl(url: string, size?: number): string {
  const base = `/api/favicon?url=${encodeURIComponent(url)}`;
  return size ? `${base}&size=${size}` : base;
}
