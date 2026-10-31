#!/usr/bin/env node
// Cloudflare Workers 预设构建入口（package.json 的 build:cf 指向本文件）。
//
// 为什么要这个脚本：
//   `NITRO_PRESET=cloudflare_module nuxt build` 这种前置环境变量写法只在 POSIX shell 下有效，
//   Windows 的 cmd/PowerShell 会报错；为了不引入 cross-env 依赖，这里在 Node 里设置
//   process.env 后再 spawn 本地 nuxt，天然跨平台。
//
// 用法：
//   pnpm build:cf
//   NITRO_PRESET=node-server pnpm build:cf   # 需要对比别的预设时可覆盖
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";

// 只在外部未指定时补默认值，保留手动覆盖能力
process.env.NITRO_PRESET ||= "cloudflare_module";

const binDir = join(rootDir, "node_modules", ".bin");
// Windows 下 node_modules/.bin 里是可执行的 .cmd 包装脚本，没有扩展名的那份是 sh 脚本
const candidates = isWindows ? ["nuxt.cmd", "nuxt.exe", "nuxt"] : ["nuxt"];
const nuxtBin = candidates.map((name) => join(binDir, name)).find((path) => existsSync(path));

if (!nuxtBin) {
  console.error("[build:cf] 找不到本地 nuxt 可执行文件，请先执行 pnpm install");
  console.error(`[build:cf] 已查找：${binDir}`);
  process.exit(1);
}

console.log(`[build:cf] NITRO_PRESET=${process.env.NITRO_PRESET}`);
console.log(`[build:cf] 执行：${nuxtBin} build`);

// .cmd 在 Node 下必须经由 shell 启动；带引号是为了兼容含空格的路径
const result = spawnSync(isWindows ? `"${nuxtBin}"` : nuxtBin, ["build"], {
  cwd: rootDir,
  stdio: "inherit",
  shell: isWindows,
  env: process.env,
});

if (result.error) {
  console.error(`[build:cf] 启动 nuxt build 失败：${result.error.message}`);
  process.exit(1);
}

// 透传子进程退出码（被信号中断时 status 为 null，按失败处理）
const exitCode = result.status ?? 1;

if (exitCode === 0) {
  const serverEntry = join(rootDir, ".output", "server", "index.mjs");
  if (existsSync(serverEntry)) {
    console.log(`[build:cf] 构建完成：${serverEntry}`);
  } else {
    console.warn("[build:cf] 构建返回成功，但未找到 .output/server/index.mjs，请检查 nitro 预设");
  }
} else {
  console.error(`[build:cf] nuxt build 失败，退出码 ${exitCode}`);
}

process.exit(exitCode);
