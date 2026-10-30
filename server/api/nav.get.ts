import { getCategories } from "~~/server/utils/queries";
import { getSession } from "~~/server/utils/session";

/**
 * 站点外壳数据：当前用户 + 侧边栏分类树（仅结构，不含链接列表）
 * 页面布局一次请求拿全，登录状态与分类一起刷新。
 */
export default defineEventHandler(async (event) => {
  const session = await getSession(event);
  const categories = await getCategories(session?.user?.id);
  return { user: session?.user ?? null, categories };
});
