import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const json = await request.json();
    const result = searchSchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    const { query } = result.data;

    const links = await prisma.link.findMany({
      where: {
        userId: session.user.id,
        OR: [
          { title: { contains: query } },
          { description: { contains: query } },
          { url: { contains: query } },
        ],
      },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }],
      take: 50,
    });

    const categories = await prisma.category.findMany({
      where: {
        name: { contains: query },
      },
      take: 10,
    });

    return NextResponse.json({ links, categories });
  } catch (error) {
    console.error("Failed to search:", error);
    return NextResponse.json(
      { error: "搜索失败" },
      { status: 500 }
    );
  }
}
