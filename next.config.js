const nextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 30,   // 动态页面（含 auth()）缓存 30s — 路由切换秒开
      static: 180,   // 静态页面缓存 3min
    },
  },
}

module.exports = nextConfig
