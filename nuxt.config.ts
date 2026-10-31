export default defineNuxtConfig({
  compatibilityDate: "2026-10-30",
  devtools: { enabled: false },
  css: ["~/assets/css/main.css"],
  modules: [
    "@nuxt/ui",
    "@pinia/nuxt",
    "@pinia/colada-nuxt",
    "nuxt-auth-utils",
    "nuxt-security",
    "@nuxt/eslint",
  ],
  app: {
    head: {
      titleTemplate: "%s · OneNav",
      htmlAttrs: { lang: "zh-CN" },
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "theme-color", content: "#0f172a" },
      ],
      link: [{ rel: "icon", href: "/icon.svg" }],
      // color-mode 已注入首帧脚本；这里仅补齐「5 天过期回 system」并纠正 class
      script: [
        {
          key: "theme-init",
          innerHTML: `(function(){try{var t=localStorage.getItem("theme");var e=localStorage.getItem("theme-expiry");if(e&&Date.now()>Number(e)){t=null;localStorage.removeItem("theme");localStorage.removeItem("theme-expiry");}var d=t==="dark"||((!t||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.classList.toggle("light",!d);}catch(_){}})();`,
          tagPosition: "head",
        },
      ],
    },
  },
  colorMode: {
    preference: "system",
    fallback: "light",
    storageKey: "theme",
    classSuffix: "",
  },
  icon: {
    serverBundle: { collections: ["lucide"] },
  },
  // 本项目只用系统字体栈；关闭远程字体 provider，避免离线/Workers 构建期联网
  fonts: {
    providers: { google: false, googleicons: false },
  },
  runtimeConfig: {
    // 仅服务端可读，运行期由 NUXT_* 环境变量覆盖；不在构建期烘焙密钥
    databaseUrl: "",
    authSecret: "",
    upstashRedisRestUrl: "",
    upstashRedisRestToken: "",
    resendApiKey: "",
    resendFrom: "",
    // nuxt-auth-utils 密封会话：password 由 NUXT_SESSION_PASSWORD 注入（构建产物中只读，不可运行期赋值）
    session: {
      name: "onenav_session",
      maxAge: 60 * 60 * 24 * 30,
      password: "",
      cookie: {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  security: {
    // CSRF 由 server/middleware/csrf.ts 做 Origin/Host 校验；nuxt-csurf 需要双提交 token，不适用
    csrf: false,
    xssValidator: false,
    rateLimiter: false,
    allowedMethodsRestricter: false,
    sri: false,
    nonce: false,
    removeLoggers: false,
    // 先以 report-only 观察，不阻断第三方头像/图标等资源
    contentSecurityPolicyReportOnly: true,
    requestSizeLimiter: {
      maxRequestSizeInBytes: 8_000_000,
      maxUploadFileRequestInBytes: 8_000_000,
    },
    headers: {
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'"],
        "style-src": ["'self'", "'unsafe-inline'", "https:"],
        "img-src": ["'self'", "data:", "https:"],
        "font-src": ["'self'", "data:", "https:"],
        "connect-src": ["'self'"],
        "frame-ancestors": ["'self'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
        "object-src": ["'none'"],
      },
    },
  },
  typescript: { strict: true },
});
