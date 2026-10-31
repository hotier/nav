# 决策文档：剩余未决项收口 + P6 清理

日期：2026-10-31

分支：`vue`

状态：已确认并实施（本文即结论记录）。前置文档：`docs/plans/2026-10-30-vue-nuxt-stack-decisions.md`（第 9 节 P6、第 11 节未决项）。

## 0. 本轮范围

一次收口三件事：

1. **P6 清理**：移除 `resend` / `openai` / `clsx` / `tailwind-merge` 依赖与相关死代码，删除 Next 时代遗留接口。
2. **CI 与 Cloudflare 预设**：补齐决策文档 7.3 / 7.4 节，仓库从「无 CI」变为有门禁。
3. **未决项决策**：把上一份文档第 11 节的 7 个问题一次性定稿（见第 3 节）。

## 1. P6 清理结论

| 项 | 处理 | 说明 |
|---|---|---|
| `resend` SDK | **改为 `$fetch` 调 REST** | `server/utils/email.ts` POST `https://api.resend.com/emails`，显式 `method: "POST"`。导出签名与错误语义不变：未配置 key 抛 `EmailSendError("邮件服务未配置")`；非 2xx 与网络异常统一包成 `EmailSendError(message, status)`，429 仍可被上层识别。邮件 HTML 模板逐字节未改 |
| `openai` SDK | **删除** | `server/utils/openai.ts` 的 `getOpenAI()` 全仓 **0 调用方**：AI 智能搜索从未实现。同时移除 `runtimeConfig.openaiApiKey` / `openaiBaseUrl` |
| `clsx` / `tailwind-merge` | **删除** | 唯一使用者是 `server/utils/utils.ts`，其中 `cn()` 0 调用方、`proxyImageUrl()` 与客户端 `app/utils/url.ts` 重复，整文件删除 |
| `GET /api/cache-version` | **删除** | Next 时代客户端版本比对遗留，Nuxt 版前端 0 调用（Colada 失效不需要它） |

清理后 `package.json` 运行时依赖只剩实际使用的包，服务端不再有 SDK 形态的第三方客户端——符合决策文档 7.2 的 Workers 可移植约束。

## 2. CI 与 Cloudflare 预设

新增文件：

| 文件 | 作用 |
|---|---|
| `.github/workflows/ci.yml` | push(`main`/`vue`) + PR；Node 24 + pnpm 12.4.1；`install --frozen-lockfile` → `typecheck` → `lint` → `build` → `build:cf` → `check:cf-size` |
| `wrangler.jsonc` | Workers 部署配置：`main` 指向 `.output/server/index.mjs`、`nodejs_compat`、`ASSETS` 绑定 `.output/public`、`observability` |
| `scripts/build-cf.mjs` | 跨平台设置 `NITRO_PRESET=cloudflare_module` 并调用本地 `nuxt build`（不引入 `cross-env`） |
| `scripts/check-cf-size.mjs` | 递归 gzip 统计产物体积，默认 3 MiB 阈值（Workers 免费版上限），支持 `--limit` / `--top` |

约定：

- **门禁只统计 Worker 脚本**（`.output/server`，排除 `*.map`）。`.output/public` 是静态资源，单独展示、不计入 3 MiB 上限。
- CI 构建期**不碰数据库**（不跑 migrate / seed），与本项目「构建幂等」原则一致。
- CI 用 `--registry=https://registry.npmjs.org` 覆盖仓库 `.npmrc` 的 npmmirror，保证与 lockfile 一致；`@img` 仍走官方源。
- `wrangler` **未**加入 devDependencies（体积大、仅部署时需要）：`pnpm add -D wrangler` 后再 `wrangler deploy`。

## 3. 未决项定稿（对应上一份文档第 11 节）

| # | 问题 | 结论 | 理由 / 落地方式 |
|---|---|---|---|
| 1 | 主题 5 天过期是否保留 | **保留** | 已实现于 `nuxt.config.ts` 的 head 内联脚本（首帧生效）。本轮把 `useTheme` 收敛为 `useColorMode()` 的薄封装：主题真源只有一个（color-mode），不再手工 toggle `documentElement` 的 class；切换时续期 `theme-expiry` |
| 2 | 是否恢复 GitHub OAuth | **不恢复** | `Account` 表结构保留不动；登录入口不实现。恢复需单独需求（涉及回调域名、scope、账号绑定策略） |
| 3 | 是否引入 ESLint / Prettier | **引入 ESLint + Prettier** | `@nuxt/eslint` + `eslint` + `prettier`，配置 `eslint.config.mjs`、`.prettierrc.json`、`.prettierignore`。**门禁只跑 `pnpm lint`（0 error）**；`pnpm format` 供开发按需使用 |
| 4 | 旧表 `Session` / `VerificationToken` 是否删除 | **本轮不删** | `Session` 已不被 nuxt-auth-utils 使用，但删除属于生产库破坏性变更，留待稳定一个版本周期后单独迁移；`VerificationToken` 仍是注册/重置 nonce 载体，**必须保留** |
| 5 | 视觉重做幅度 | **保持现状** | 沿用 Nuxt UI 4 令牌 + 自研 `LinkCard` / 拖拽网格；本轮不动视觉，避免与功能收口混在一个 diff 里 |
| 6 | Cloudflare 免费版 vs Paid | **目标 Paid** | 免费版 10ms CPU 无法稳定完成 bcrypt 登录。代码保持 Workers 可移植（无 `node:fs` / `node:crypto` / `Buffer`），CI 用 3 MiB（免费版上限）作为**最严基线**，Paid 的 10 MiB 天然满足 |
| 7 | 后台统计是否新增聚合指标 | **本轮不加** | 沿用 `dashboardStatsKey` 现有字段；新增指标需先定义口径（与 `buildStatsWhere` 权限口径一致），单独提需求 |

补充决策（本轮顺带定稿）：

| 项 | 结论 |
|---|---|
| AI 智能搜索 | **确认未实现**（`getOpenAI` 0 调用方）。删除死代码、`runtimeConfig.openai*` 与 README 中的功能描述；如需该能力另立需求，届时用 `$fetch` 调 OpenAI 兼容 REST，不引 SDK |
| 代码库 Prettier 化 | **暂不做全库格式化**：`format:check` 不进门禁，避免一次性 9000+ 行纯格式 diff。新改动按 `.prettierrc.json` 写，后续可择机全量 `pnpm format` |
| `docs/plans/` 归档 | 本文件与 `2026-10-30-vue-nuxt-stack-decisions.md` 并存，后者仍是架构决策真源，本文件只记录「未决项的答案」与 P6 收口 |

## 4. 验收标准（本轮）

1. `pnpm typecheck` 0 error。
2. `pnpm lint` 0 error（warning 允许）。
3. `pnpm build` 成功。
4. `pnpm build:cf` 成功，`pnpm check:cf-size` 通过（`.output/server` gzip ≤ 3 MiB）。
5. 依赖中不再出现 `resend` / `openai` / `clsx` / `tailwind-merge`；`grep` 无对应 import。
6. 主题三态切换、`theme-expiry` 续期、SSR 首帧无 hydration mismatch。
7. 邮件未配置时注册/找回密码仍返回「邮件服务未配置」语义；配置后 429 能正确透传。
