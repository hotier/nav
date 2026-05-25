import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateLinks, incrementTableVersion } from "@/lib/queries";

export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { updates } = await request.json();

    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: "无效的数据格式" }, { status: 400 });
    }

    // Update sort orders in transaction
    await prisma.$transaction(
      updates.map((update: { id: string; sortOrder: number }) =>
        prisma.link.updateMany({
          where: {
            id: update.id,
            userId: session.user.id,
          },
          data: {
            sortOrder: update.sortOrder,
          },
        })
      )
    );

    invalidateLinks(session.user.id);
    incrementTableVersion("Link").catch((e) => console.warn("[version] Link递增失败:", e));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to reorder links:", error);
    return NextResponse.json({ error: "重排失败" }, { status: 500 });
  }
}
