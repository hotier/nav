import { ensureSessionReady } from "~~/server/utils/session";

/**
 * nuxt-auth-utils 的会话端点由模块提供，不会经过我们的 getSession 包装；
 * 这里保证密封密钥在任何路由之前已就绪（只读一次，后续为内存判断）。
 */
export default defineEventHandler(async () => {
  await ensureSessionReady();
});
