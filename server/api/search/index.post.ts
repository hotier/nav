import { and, like } from "drizzle-orm";
import { getDb } from "~~/server/utils/db";
import { requireSession } from "~~/server/utils/session";
import { searchSchema } from "~~/server/utils/validators";
import { searchLinks } from "~~/server/utils/search";
import { buildCategoryWhere } from "~~/server/utils/permissions";
import { defineApiHandler, fail } from "~~/server/utils/api";
import { categories } from "~~/server/database/schema";

export default defineApiHandler(async (event) => {
  const session = await requireSession(event);

  const result = searchSchema.safeParse(await readBody(event));
  if (!result.success) {
    return fail(event, 400, result.error.errors[0]?.message || "参数错误");
  }

  const { query } = result.data;
  const userRole = session.user.role ?? undefined;

  const links = await searchLinks(query, session.user.id, userRole);

  // 分类搜索：复用分类权限真源，只返回安全字段
  const matchedCategories = await getDb()
    .select({ id: categories.id, name: categories.name, icon: categories.icon })
    .from(categories)
    .where(
      and(
        buildCategoryWhere(session.user.id, "home", userRole),
        like(categories.name, `%${query}%`),
      ),
    )
    .limit(10);

  return { links, categories: matchedCategories };
});
