#!/usr/bin/env node
// Cloudflare Workers 产物体积门禁（package.json 的 check:cf-size 指向本文件）。
//
// Workers 免费版对 gzip 后的 Worker 脚本体积上限约 3 MiB（压缩后），超过即无法部署。
// 判定口径（与真实部署限制对齐）：
//   - 只统计 .output/server，这是要上传的 Worker 脚本本体；
//   - 跳过 *.map：真实 cloudflare_module 产物默认不带 sourcemap，带 map 时也不该算进脚本体积；
//   - .output/public 是 Workers 静态资源（assets），单独计费、不计入脚本上限，因此仅展示、不参与判定。
// 超阈值时以退出码 1 结束，供 CI 拦截。
//
// 用法：
//   pnpm check:cf-size                  # 默认阈值 3 MiB
//   pnpm check:cf-size --limit=5        # 自定义阈值（MiB，支持小数）
//   node scripts/check-cf-size.mjs --limit 2.5 --top=20
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(rootDir, ".output");
const serverDir = join(outputDir, "server");
const publicDir = join(outputDir, "public");

const DEFAULT_LIMIT_MIB = 3;
const DEFAULT_TOP = 15;
const PUBLIC_TOP = 5;
const MIB = 1024 * 1024;

/** 解析 --limit=<MiB> / --limit <MiB> / --top=<N> */
function parseArgs(argv) {
  const options = { limitMiB: DEFAULT_LIMIT_MIB, top: DEFAULT_TOP };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      console.log("用法：node scripts/check-cf-size.mjs [--limit=<MiB>] [--top=<N>]");
      console.log("");
      console.log("判定口径：只统计 .output/server 的 gzip 体积（排除 *.map），默认阈值 3 MiB；");
      console.log(".output/public 为 Workers 静态资源，仅展示、不计入 Worker 脚本体积上限。");
      process.exit(0);
    }

    const match = /^--(limit|top)(?:=(.*))?$/.exec(arg);
    if (!match) {
      console.error(`[check:cf-size] 无法识别的参数：${arg}`);
      process.exit(1);
    }

    const [, name, inlineValue] = match;
    const rawValue = inlineValue ?? argv[++i];
    const value = Number(rawValue);

    if (!Number.isFinite(value) || value <= 0) {
      console.error(`[check:cf-size] --${name} 需要一个大于 0 的数字，收到：${rawValue ?? "(空)"}`);
      process.exit(1);
    }

    if (name === "limit") options.limitMiB = value;
    else options.top = Math.floor(value);
  }

  return options;
}

/** 递归收集目录下所有文件的绝对路径（不跟随符号链接） */
function collectFiles(dir) {
  const files = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function formatMiB(bytes) {
  return `${(bytes / MIB).toFixed(3)} MiB`;
}

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

/**
 * 统计一个根目录的 gzip 体积。
 * 返回计入统计的文件明细（不含 *.map）、被排除的 sourcemap 明细，以及各自合计。
 */
function measureRoot(rootPath, label) {
  if (!existsSync(rootPath)) return null;

  const counted = [];
  const excludedMaps = [];

  for (const filePath of collectFiles(rootPath)) {
    // level 6 与 Workers 侧实际压缩率最接近，避免用 level 9 低估体积
    const size = gzipSync(readFileSync(filePath), { level: 6 }).length;
    const entry = {
      path: relative(rootDir, filePath).split(sep).join("/"),
      size,
    };

    // sourcemap 不计入 Worker 脚本体积
    if (filePath.toLowerCase().endsWith(".map")) excludedMaps.push(entry);
    else counted.push(entry);
  }

  const sum = (entries) => entries.reduce((total, entry) => total + entry.size, 0);

  return {
    label,
    files: counted,
    total: sum(counted),
    excludedMaps,
    excludedMapTotal: sum(excludedMaps),
  };
}

function main() {
  const { limitMiB, top } = parseArgs(process.argv.slice(2));

  if (!existsSync(outputDir)) {
    console.error("[check:cf-size] 未找到 .output 目录，无法统计体积。");
    console.error("[check:cf-size] 请先执行 pnpm build:cf 生成 Cloudflare 预设产物。");
    process.exit(1);
  }

  if (!existsSync(serverDir)) {
    console.error("[check:cf-size] 未找到 .output/server，产物不完整。");
    console.error("[check:cf-size] 请先执行 pnpm build:cf 重新构建。");
    process.exit(1);
  }

  const serverRoot = measureRoot(serverDir, "server");
  const publicRoot = measureRoot(publicDir, "public");

  // 判定依据只有 .output/server（排除 *.map）
  const totalBytes = serverRoot.total;
  const limitBytes = limitMiB * MIB;

  const countedFiles = [...serverRoot.files].sort((a, b) => b.size - a.size);
  const publicFiles = publicRoot ? [...publicRoot.files].sort((a, b) => b.size - a.size) : [];

  const excludedMaps = [...serverRoot.excludedMaps, ...(publicRoot?.excludedMaps ?? [])];
  const excludedMapBytes = excludedMaps.reduce((total, file) => total + file.size, 0);

  console.log("");
  console.log("Cloudflare Workers 产物体积检查（gzip 后）");
  console.log(`  产物目录：${outputDir}`);
  console.log("  判定范围：.output/server（排除 *.map）");
  console.log("");

  console.log("按目录汇总：");
  console.log(
    `  ${"server".padEnd(8)} ${formatMiB(serverRoot.total).padStart(12)}  (${serverRoot.files.length} 个文件)  ← 计入判定`,
  );
  if (publicRoot) {
    console.log(
      `  ${"public".padEnd(8)} ${formatMiB(publicRoot.total).padStart(12)}  (${publicRoot.files.length} 个文件)  ← 仅展示`,
    );
    console.log("            public 为静态资源，不计入 Worker 脚本体积上限");
  } else {
    console.log("  public   （不存在，跳过）");
  }
  console.log(
    `  已排除 sourcemap：${excludedMaps.length} 个文件，${formatMiB(excludedMapBytes)}（*.map 不计入脚本体积）`,
  );
  console.log("");

  console.log(`最大的 ${Math.min(top, countedFiles.length)} 个 Worker 脚本文件（.output/server，不含 *.map）：`);
  for (const file of countedFiles.slice(0, top)) {
    console.log(`  ${formatKiB(file.size).padStart(11)}  ${file.path}`);
  }
  console.log("");

  if (publicFiles.length > 0) {
    console.log(`最大的 ${Math.min(PUBLIC_TOP, publicFiles.length)} 个静态资源（.output/public，仅展示）：`);
    for (const file of publicFiles.slice(0, PUBLIC_TOP)) {
      console.log(`  ${formatKiB(file.size).padStart(11)}  ${file.path}`);
    }
    console.log("");
  }

  const overLimit = totalBytes > limitBytes;
  const usagePercent = ((totalBytes / limitBytes) * 100).toFixed(1);

  console.log(
    `总计（Worker 脚本）：${formatMiB(totalBytes)} / 阈值 ${formatMiB(limitBytes)}（已用 ${usagePercent}%）`,
  );

  if (overLimit) {
    console.error(
      `[check:cf-size] 超出阈值 ${formatMiB(totalBytes - limitBytes)}，Workers 免费版将无法部署。`,
    );
    console.error("[check:cf-size] 处理建议：精简依赖、拆分 Worker、或改用 Workers 付费版。");
    process.exitCode = 1;
    return;
  }

  console.log("[check:cf-size] 通过。");
}

main();
