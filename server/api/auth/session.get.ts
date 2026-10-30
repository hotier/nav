import { getSession } from "~~/server/utils/session";

/** 当前登录用户（未登录返回 user: null，供前端水合时使用） */
export default defineEventHandler(async (event) => {
  const session = await getSession(event);
  return { user: session?.user ?? null };
});
