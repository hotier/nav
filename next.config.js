const nextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 60,   // 动态页面缓存 1min（等同于 SWR 分类 TTL 5min，过期后服务端 SWR 兜底）
      static: 300,   // 静态页面缓存 5min
    },
  },
}

module.exports = nextConfig
