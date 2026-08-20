import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/cache-version?table=Category
 *
 * 返回指定数据表的当前版本号。
 * 客户端通过比对本地与服务器版本号，判断是否需要重新拉取数据。
 *
 * 支持的 table 值：Category | Link | User
 *
 * 不做 SWR 内存缓存：版本号是数据一致性的核心，任何写操作都会递增它。
 * 若此处缓存，数据变更后版本号不立即反映，前端会误判“版本未变”而读到旧缓存。
 * 版本号查询为轻量 DB 操作（upsert + select），直接查 DB 保证始终返回最新版本号。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get("table");

  if (!table) {
    return NextResponse.json({ error: "缺少 table 参数" }, { status: 400 });
  }

  try {
    const key = `version:${table}`;
    // upsert: 不存在则创建（初始值=1），存在则不动（update: {} 为空操作）
    const setting = await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: "1" },
      update: {},
    });
    const version = parseInt(setting.value, 10) || 0;

    return NextResponse.json({ table, version });
  } catch (error) {
    console.error("[cache-version] 获取版本失败:", error);
    return NextResponse.json({ version: 0 });
  }
}
