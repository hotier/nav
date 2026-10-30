import { eq } from "drizzle-orm";
import { getDb } from "~~/server/utils/db";
import { defineApiHandler, fail } from "~~/server/utils/api";
import { appSettings } from "~~/server/database/schema";

/** 只允许查询业务表版本，避免用任意 key 探测 AppSetting */
const ALLOWED_TABLES = new Set(["Category", "Link", "User", "DashboardStats"]);

/**
 * GET /api/cache-version?table=Category
 *
 * 返回指定数据表的当前版本号。客户端比对本地与服务器版本号决定是否重新拉取。
 * 不缓存、读路径不写库（旧实现每次 GET 都 upsert，已移除）。
 */
export default defineApiHandler(async (event) => {
  const table = String(getQuery(event).table || "");
  if (!table || !ALLOWED_TABLES.has(table)) return fail(event, 400, "无效的 table 参数");

  try {
    const [setting] = await getDb()
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, `version:${table}`))
      .limit(1);
    return { table, version: parseInt(setting?.value || "0", 10) || 0 };
  } catch (error) {
    console.error("[cache-version] 获取版本失败:", error);
    return { version: 0 };
  }
});
