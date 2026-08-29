/**
 * 滑动窗口限流器 —— Redis 优先，内存降级
 *
 * 用于认证类接口（忘记密码发码、验证码校验、注册等）的补充限流：
 *   - 与账号级持久化冷却（DB verificationToken）配合使用
 *   - 覆盖"账号不存在"等不落库的路径，防止限流被绕过
 *   - 提供 IP 维度整体频率控制
 *
 * 后端选择（见 lib/redis.ts）：
 *   - 配置 Upstash Redis → Lua 原子 INCR + PEXPIRE，跨实例精确计数
 *     （多实例 / Serverless 部署必须，否则每个实例各自计数可被绕过）
 *   - 未配置 → 单实例内存 Map
 *
 * IP 取自反向代理注入的头，生产环境应确保代理可信。
 */

import { RATE_LIMIT_KEY_PREFIX, getRedis } from "@/lib/redis";

const buckets = new Map<string, { count: number; resetAt: number }>();

// Redis Lua：原子递增并设置首次过期（避免 INCR/EXPIRE 两步的竞态窗口）
const INCR_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return current
`;

/**
 * 检查并计数：超限返回 true
 * @param key     限流维度标识（如 `forgot:ip:1.2.3.4`）
 * @param limit   窗口内允许的最大次数
 * @param windowMs 窗口时长（毫秒）
 */
export async function isRateLimited(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const client = getRedis();

  if (client) {
    const rkey = RATE_LIMIT_KEY_PREFIX + key;
    const count = await client.eval<[string], number>(INCR_SCRIPT, [rkey], [String(windowMs)]);
    return count > limit;
  }

  // ---- 内存后端（单实例） ----
  const now = Date.now();
  const bucket = buckets.get(key);

  // 无记录或窗口已过 → 重置窗口并放行
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  bucket.count += 1;

  // 防止恶意注入大量 key 导致内存膨胀：超过阈值时惰性清理过期项
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (now >= v.resetAt) buckets.delete(k);
    }
  }

  return bucket.count > limit;
}

/** 获取客户端 IP：优先 X-Forwarded-For 首段，回退 X-Real-IP */
export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}

/** 清空全部限流记录（测试/调试用） */
export async function clearRateLimits(): Promise<void> {
  const client = getRedis();
  if (client) {
    const pattern = RATE_LIMIT_KEY_PREFIX + "*";
    let cursor = 0;
    do {
      const [next, keys] = await client.scan(cursor, { match: pattern, count: 100 });
      cursor = Number(next);
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } while (cursor !== 0);
    return;
  }
  buckets.clear();
}
