import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOpenAI } from "@/lib/openai";
import { z } from "zod";

const aiSearchSchema = z.object({
  query: z.string().min(1, "查询内容不能为空"),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "AI 功能未配置" },
        { status: 400 }
      );
    }

    const json = await request.json();
    const result = aiSearchSchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    const { query } = result.data;

    const allLinks = await prisma.link.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        title: true,
        url: true,
        description: true,
        category: {
          select: { name: true },
        },
      },
    });

    if (allLinks.length === 0) {
      return NextResponse.json({ links: [], message: "没有找到相关链接" });
    }

    const linksContext = allLinks
      .map(
        (link) =>
          `- ${link.title}: ${link.url} (分类: ${link.category.name})${
            link.description ? ` - ${link.description}` : ""
          }`
      )
      .join("\n");

    const openai = await getOpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `你是一个智能书签助手。用户会提供一个查询，你需要在书签列表中找到最相关的书签。

书签列表：
${linksContext}

根据用户查询，返回最相关的书签 ID 列表（最多返回 10 个）。只返回 ID，用逗号分隔，不要有其他内容。
如果没有任何书签相关，返回 "NONE"。`,
        },
        {
          role: "user",
          content: query,
        },
      ],
      max_tokens: 200,
      temperature: 0.7,
    });

    const response = completion.choices[0]?.message?.content?.trim() || "";

    if (response === "NONE" || !response) {
      return NextResponse.json({ links: [], message: "没有找到相关链接" });
    }

    const matchedIds = response
      .split(",")
      .map((id) => id.trim())
      .filter((id) => allLinks.some((link) => link.id === id));

    if (matchedIds.length === 0) {
      return NextResponse.json({ links: [], message: "没有找到相关链接" });
    }

    const links = await prisma.link.findMany({
      where: {
        id: { in: matchedIds },
        userId: session.user.id,
      },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });

    const orderedLinks = matchedIds
      .map((id) => links.find((link) => link.id === id))
      .filter((link): link is NonNullable<typeof link> => link !== undefined);

    return NextResponse.json({ links: orderedLinks });
  } catch (error) {
    console.error("Failed to AI search:", error);
    return NextResponse.json(
      { error: "AI 检索失败" },
      { status: 500 }
    );
  }
}
