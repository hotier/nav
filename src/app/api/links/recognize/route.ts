import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recognizeUrl } from "@/lib/recognize-url";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const { url } = await request.json();
  if (!url) {
    return NextResponse.json({ error: "URL不能为空" }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "无效的URL格式" }, { status: 400 });
  }

  const meta = await recognizeUrl(url);

  if (!meta.title) {
    return NextResponse.json({ error: "获取网页信息失败" }, { status: 500 });
  }

  return NextResponse.json(meta);
}
