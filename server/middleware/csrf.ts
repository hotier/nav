/**
 * CSRF 防护：对状态变更请求校验 Origin/Referer 与 Host 一致。
 *
 * Cookie 会话依赖浏览器自动携带凭证，跨站 POST 必须拦截。
 * - 有 Origin：必须与 Host 同源（含端口）
 * - 无 Origin 但有 Referer：校验 Referer 同源
 * - 两者都没有：视为非浏览器客户端（curl/服务器调用），放行
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function firstHeaderValue(value: string | undefined): string | undefined {
  return value?.split(",")[0]?.trim() || undefined;
}

export default defineEventHandler((event) => {
  const method = getMethod(event);
  if (SAFE_METHODS.has(method)) return;

  const host = firstHeaderValue(
    getHeader(event, "x-forwarded-host") || getHeader(event, "host"),
  );
  const source = getHeader(event, "origin") || getHeader(event, "referer");
  if (!source) return;

  let sourceHost: string;
  try {
    sourceHost = new URL(source).host;
  } catch {
    throw createError({ statusCode: 403, statusMessage: "跨站请求已拒绝" });
  }

  if (!host || sourceHost.toLowerCase() !== host.toLowerCase()) {
    throw createError({ statusCode: 403, statusMessage: "跨站请求已拒绝" });
  }
});
