/**
 * API 响应约定：错误统一返回 { error: string }，HTTP 状态码表达类别。
 * 前端 fetcher 直接读取 body.error 展示 toast。
 */
import { type H3Event, type H3Error, isError, setResponseStatus } from "h3";

export function fail(event: H3Event, statusCode: number, message: string) {
  setResponseStatus(event, statusCode);
  return { error: message };
}

/**
 * 包装业务 handler：把 createError（含权限中间件抛出的 401/403）统一转成
 * { error } 响应体，未预期异常记录日志并返回 500。
 */
export function defineApiHandler<T>(handler: (event: H3Event) => Promise<T> | T) {
  return defineEventHandler(async (event) => {
    try {
      return await handler(event);
    } catch (err) {
      if (isError(err)) {
        const e = err as H3Error;
        const status = e.statusCode || 500;
        if (status >= 500) console.error("[api]", e);
        setResponseStatus(event, status);
        return { error: e.statusMessage || e.message || "请求失败" };
      }
      console.error("[api]", err);
      setResponseStatus(event, 500);
      return { error: "服务器内部错误" };
    }
  });
}

/** 从请求体读取 JSON（h3 的 readBody 在空 body 时返回 undefined） */
export function bodyOf(event: H3Event): Promise<Record<string, unknown>> {
  return readBody<Record<string, unknown>>(event).then((b) => b ?? {});
}
