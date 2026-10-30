/**
 * AUTH_SECRET 解析：环境变量优先，其次数据库 AppSetting（跨部署持久化），
 * 最后仅在开发环境生成临时密钥。
 *
 * 与旧实现的区别：不再把密钥编译进产物/提交到仓库，运行期按需读取。
 */
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { randomBase64 } from "./crypto";
import { appSettings } from "~~/server/database/schema";

let cached: string | undefined;

export async function getAuthSecret(): Promise<string> {
  if (cached) return cached;

  const fromEnv =
    (useRuntimeConfig().authSecret as string | undefined) || process.env.AUTH_SECRET;
  if (fromEnv) {
    cached = fromEnv;
    return cached;
  }

  try {
    const [setting] = await getDb()
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, "AUTH_SECRET"))
      .limit(1);
    if (setting?.value) {
      cached = setting.value;
      return cached;
    }
    if (process.env.NODE_ENV !== "production") {
      cached = randomBase64(32);
      console.warn("[auth] 未配置 AUTH_SECRET，已生成临时密钥（重启后会话失效）");
      return cached;
    }
  } catch (err) {
    console.error("[auth] 读取 AUTH_SECRET 失败:", err);
  }

  throw new Error("AUTH_SECRET 未配置：请设置环境变量或执行 pnpm db:seed 写入数据库");
}
