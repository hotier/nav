import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 通过服务端 /api/favicon 代理加载外部图片，避免客户端直接请求外部 URL */
export function proxyImageUrl(url: string): string {
  return `/api/favicon?url=${encodeURIComponent(url)}`;
}
