import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { swr } from "@/lib/cache";

/**
 * GET /api/cache-version?table=Category
 *
 * 返回指定数据表的当前版本号。
 * 客户端通过比对本地与服务器版本号，判断是否需要重新拉取数据。
 *
 * 支持的 table 值：Category | Link | User
 *
 * 性能优化：SWR 内存缓存（60s TTL），避免每次请求都查 DB。
 * 版本号在单次会话内极少变化，60s 缓存足以覆盖同一次页面浏览。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get("table");

  if (!table) {
    return NextResponse.json({ error: "缺少 table 参数" }, { status: 400 });
  }

  try {
    const version = await swr(
      `cache-version:${table}`,
      async () => {
        const key = `version:${table}`;
        // upsert: 不存在则创建（初始值=1），存在则不动（update: {} 为空操作）
        const setting = await prisma.appSetting.upsert({
          where: { key },
          create: { key, value: "1" },
          update: {},
        });
        return parseInt(setting.value, 10) || 0;
      },
      60_000, // 60s TTL — 版本极少在同一会话内变化
    );

    return NextResponse.json({ table, version });
  } catch (error) {
    console.error("[cache-version] 获取版本失败:", error);
    return NextResponse.json({ version: 0 });
  }
}
