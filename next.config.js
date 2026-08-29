const nextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 60,   // 动态页面缓存 1min（等同于 SWR 分类 TTL 5min，过期后服务端 SWR 兜底）
      static: 300,   // 静态页面缓存 5min
    },
  },
  // sharp 的 libvips 共享库由 @img/sharp-libvips-linux-x64 提供，运行时 dlopen 动态加载，
  // file tracing 无法静态发现，必须显式把 @img 二进制目录打进产物（否则 Vercel 运行时 ERR_DLOPEN_FAILED）
  outputFileTracingIncludes: {
    '/api/links': ['./node_modules/@img/**/*'],
    '/api/links/[id]': ['./node_modules/@img/**/*'],
    '/api/favicon': ['./node_modules/@img/**/*'],
  },
}

module.exports = nextConfig
