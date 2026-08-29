import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/cache-version?table=Category
 *
 * 返回指定数据表的当前版本号。
 * 客户端通过比对本地与服务器版本号，判断是否需要重新拉取数据。
 *
 * 支持的 table 值：Category | Link | User | DashboardStats
 *
 * 设计：
 * - 不做缓存：版本号是一致性的锚点，必须返回最新值（旧版本号 → 旧缓存键 → 旧数据）。
 * - 读路径只读不写：findUnique，miss 返回 0（表从未被写过时）。
 *   原实现每次 GET 都 upsert（读路径写放大），已修正；行由 incrementTableVersion 首写时创建。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get("table");

  if (!table) {
    return NextResponse.json({ error: "缺少 table 参数" }, { status: 400 });
  }

  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: `version:${table}` },
      select: { value: true },
    });
    const version = parseInt(setting?.value || "0", 10) || 0;

    return NextResponse.json({ table, version });
  } catch (error) {
    console.error("[cache-version] 获取版本失败:", error);
    return NextResponse.json({ version: 0 });
  }
}
