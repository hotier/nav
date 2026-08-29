import { NextResponse } from "next/server";
import { isEmailConfigured } from "@/lib/email";

/**
 * 公开的轻量运行配置（无敏感信息，仅暴露布尔开关）
 * 前端据此决定是否展示「注册」「忘记密码」等依赖邮件服务的入口
 */
export async function GET() {
  return NextResponse.json({
    emailConfigured: isEmailConfigured(),
  });
}
