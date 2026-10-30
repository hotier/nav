import { requireSession } from "~~/server/utils/session";
import { recognizeUrl } from "~~/server/utils/recognize-url";
import { defineApiHandler, fail } from "~~/server/utils/api";

export default defineApiHandler(async (event) => {
  await requireSession(event);

  const { url } = await readBody<{ url?: string }>(event);
  if (!url) return fail(event, 400, "URL不能为空");

  try {
    new URL(url);
  } catch {
    return fail(event, 400, "无效的URL格式");
  }

  const meta = await recognizeUrl(url);

  // 标题或图标任一识别成功即视为有效
  if (!meta.title && !meta.favicon) return fail(event, 500, "获取网页信息失败");
  return meta;
});
