const nextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 60,   // 动态页面缓存 1min（等同于 SWR 分类 TTL 5min，过期后服务端 SWR 兜底）
      static: 300,   // 静态页面缓存 5min
    },
  },
  // 已移除 sharp 依赖，故不再需要 outputFileTracingIncludes 声明 @img：
  // 原先 sharp 会带入 19MB 的 libvips 原生库（@img/sharp-libvips-*），且 NFT 会把
  // pnpm store 里的多个版本一起收进来，实测 /api/favicon 函数包 95.87MB 中 94.34MB 来自它。
  // 现改为纯字节解析图片尺寸（lib/image-magic.ts 的 readImageSize），零原生依赖。
  //
  // Prisma 已切到 Rust-free 模式（schema 中 engineType = "client"）：
  //   - 不再打包约 20MB 的 query_engine-*.node 原生二进制
  //   - 查询由 WASM 编译器 query_compiler_bg.wasm 承担
  // 该 wasm 是 Prisma 运行时用 fs 动态读取的（不是 require 依赖），
  // outputFileTracing 追踪不到，必须在此显式声明，否则线上报
  // ENOENT: .prisma/client/query_compiler_bg.wasm（实测首页 500）。
  // 用通配符是因为 pnpm 虚拟目录名带依赖 hash，本地与 Vercel 不一致。
  outputFileTracingIncludes: {
    '/**': [
      './node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/query_compiler_bg.wasm',
    ],
  },
  // 以下为 edge/wasm 场景与构建期专用产物，Node runtime 不加载，显式排除以缩小函数包
  outputFileTracingExcludes: {
    '/**': [
      './node_modules/@prisma/client/runtime/*.wasm-base64.js',
      './node_modules/@prisma/client/runtime/*.wasm-base64.mjs',
      // Prisma CLI 与 schema/migration 引擎：仅 prisma db push / migrate / seed 等构建期命令使用。
      // 运行时只需要 .prisma/client 下的 libquery_engine，运行时绝不加载这两处（本地实测 38MB + 70MB）。
      './node_modules/@prisma/engines/**',
      './node_modules/prisma/**',
      // client 包内的生成器构建产物，运行时不加载
      './node_modules/@prisma/client/generator-build/**',
      // prisma generate 中断残留的临时引擎副本（本地实测单个 20MB，曾出现 3 份）
      './node_modules/.prisma/client/*.tmp*',
      // Rust-free（engineType=client）下本不该存在的默认 engine 产物。
      // 本地磁盘若残留旧版生成的 query_engine-*.node（实测 20MB）或中断写入的 .tmp*，
      // outputFileTracing 会把它们一并收进函数包（曾使页面包虚增至 31MB）。
      // 运行时只加载 query_compiler_bg.wasm，故这些一律排除（含 pnpm 虚拟路径）。
      './node_modules/.prisma/client/query_engine-*',
      './node_modules/.prisma/client/query_engine_bg.*',
      './node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/query_engine-*',
      './node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/query_engine_bg.*',
      './node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/*.tmp*',
      // @prisma/client 为每种 runtime 变体各生成一份入口。本项目是 Node runtime +
      // Rust-free（engineType=client）+ @prisma/adapter-pg，运行时只加载 client.js
      // 与 query_compiler_bg.postgresql.*，以下变体运行时绝不加载：
      //   - binary / library：binary engine（libquery_engine-*.node）的加载器
      //   - edge / *-edge：Vercel Edge Runtime 变体（本项目无 edge 路由）
      //   - react-native：React Native 变体
      //   - *.d.mts / *.d.ts：类型声明，JS 运行时不加载（仅构建期类型检查用）
      './node_modules/@prisma/client/runtime/binary.js',
      './node_modules/@prisma/client/runtime/binary.mjs',
      './node_modules/@prisma/client/runtime/library.js',
      './node_modules/@prisma/client/runtime/library.mjs',
      './node_modules/@prisma/client/runtime/react-native.js',
      './node_modules/@prisma/client/runtime/edge.js',
      './node_modules/@prisma/client/runtime/edge-esm.js',
      './node_modules/@prisma/client/runtime/wasm-engine-edge.js',
      './node_modules/@prisma/client/runtime/wasm-engine-edge.mjs',
      './node_modules/@prisma/client/runtime/wasm-compiler-edge.js',
      './node_modules/@prisma/client/runtime/wasm-compiler-edge.mjs',
      './node_modules/@prisma/client/*.d.mts',
      './node_modules/@prisma/client/runtime/*.d.mts',
      './node_modules/@prisma/client/runtime/*.d.ts',
    ],
  },
}

module.exports = nextConfig
