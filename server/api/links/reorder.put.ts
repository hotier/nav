import { and, eq } from "drizzle-orm";
import { getDbPool } from "~~/server/utils/db";
import { requireSession } from "~~/server/utils/session";
import { incrementTableVersion } from "~~/server/utils/queries";
import { defineApiHandler, fail } from "~~/server/utils/api";
import { links } from "~~/server/database/schema";

export default defineApiHandler(async (event) => {
  const session = await requireSession(event);
  const { updates } = await readBody<{ updates?: Array<{ id: string; sortOrder: number }> }>(event);

  if (!Array.isArray(updates)) return fail(event, 400, "无效的数据格式");

  // 重排与版本号递增同事务：避免排序已落库、缓存仍读旧版本
  await getDbPool().transaction(async (tx) => {
    for (const update of updates) {
      await tx
        .update(links)
        .set({ sortOrder: update.sortOrder })
        .where(and(eq(links.id, update.id), eq(links.userId, session.user.id)));
    }
    await incrementTableVersion("Link", tx);
  });

  return { success: true };
});
