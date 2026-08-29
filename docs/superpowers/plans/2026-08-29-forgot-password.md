# 忘记密码（验证码找回）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现"忘记密码 → 邮箱 6 位验证码 → 重置密码"完整流程，通过 Resend 发送邮件，无邮件服务时接口明确报错。

**架构：** 新增 `src/lib/email.ts` 封装 Resend 发送；新增两个 API 路由（`forgot-password` 发码、`reset-password` 校验并重置）；验证码复用 `VerificationToken` 表（`identifier`=邮箱、`token`=验证码、`expires`=10 分钟）；将现有 `/reset-pwd` 页面改造为两阶段找回流程；重置成功后递增 `tokenVersion` 强制所有旧会话下线。

**技术栈：** Next.js 16（App Router / Route Handlers）、Prisma、bcryptjs、resend SDK、Tailwind + shadcn/ui 现有组件。

**提交说明：** 本仓库当前有大量未提交改动（其他功能开发中），执行本计划时**不自动 commit**，由用户决定提交时机。

**验证说明：** 项目无测试框架，验证方式为 curl API 手动测试 + 页面流程验证。执行者需先启动 `pnpm dev`。

---

## 文件结构

| 文件 | 操作 | 职责 |
|---|---|---|
| `src/lib/email.ts` | 创建 | Resend 封装：`isEmailConfigured()`、`sendResetCode(to, code)` |
| `src/app/api/auth/forgot-password/route.ts` | 创建 | 发验证码 API（防枚举 + 60s 限流） |
| `src/app/api/auth/reset-password/route.ts` | 创建 | 校验验证码 + 重置密码 API |
| `src/app/reset-pwd/page.tsx` | 重写 | 两阶段找回 UI |
| `src/app/login/page.tsx` | 修改 | 链接文案改为"忘记密码？" |
| `.env.example` | 修改 | 添加 Resend 配置说明 |
| `package.json` | 修改 | 添加 `resend` 依赖（通过 pnpm add） |

---

### 任务 1：安装依赖 + 邮件封装

**文件：**
- 修改：`package.json`（pnpm add 自动完成）
- 创建：`src/lib/email.ts`

- [ ] **步骤 1：安装 resend SDK**

```bash
cd d:\My_code\nav
pnpm add resend
```

预期：`package.json` 的 dependencies 出现 `"resend": "^..."`，`pnpm-lock.yaml` 更新。

- [ ] **步骤 2：创建 `src/lib/email.ts`**

```ts
import { Resend } from "resend";

const DEFAULT_FROM = "OneNav <noreply@nav.hotier.cc.cd>";

/** 邮件服务是否已配置（RESEND_API_KEY 存在） */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * 发送密码重置验证码邮件
 * @throws 未配置邮件服务或 Resend 发送失败时抛出 Error
 */
export async function sendResetCode(to: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("邮件服务未配置");
  }
  const from = process.env.RESEND_FROM || DEFAULT_FROM;
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to,
    subject: "OneNav 密码重置验证码",
    html: `
      <div style="max-width:480px;margin:0 auto;padding:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
        <h2 style="margin:0 0 16px;color:#111827;">OneNav 密码重置</h2>
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
          你的验证码是：
        </p>
        <div style="padding:16px;background:#f3f4f6;border-radius:8px;text-align:center;font-size:32px;font-weight:700;letter-spacing:8px;color:#111827;">
          ${code}
        </div>
        <p style="margin:16px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">
          验证码 10 分钟内有效。如果不是本人操作，请忽略此邮件。
        </p>
      </div>
    `,
  });
  if (error) {
    throw new Error(error.message);
  }
}
```

- [ ] **步骤 3：验证无类型/语法错误**

运行：`npx tsc --noEmit`
预期：无 `src/lib/email.ts` 相关报错（若项目原本就有报错，仅需确认没有新增）。

---

### 任务 2：`POST /api/auth/forgot-password`

**文件：**
- 创建：`src/app/api/auth/forgot-password/route.ts`

- [ ] **步骤 1：先确认失败路径（未配置邮件服务时拒绝）**

创建路由后（空实现或直接写完整实现后验证），用 curl 验证 503：

```bash
curl -s -X POST http://localhost:3000/api/auth/forgot-password -H "Content-Type: application/json" -d "{\"account\":\"admin\"}"
```

预期（未配置 `RESEND_API_KEY`）：HTTP 503，JSON `{"error":"系统未配置邮件服务，请联系管理员"}`

- [ ] **步骤 2：创建 `src/app/api/auth/forgot-password/route.ts`**

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { isEmailConfigured, sendResetCode } from "@/lib/email";

const CODE_TTL_MS = 10 * 60 * 1000; // 验证码有效期 10 分钟
const COOLDOWN_MS = 60 * 1000; // 同一账号 60 秒内限发一次

function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export async function POST(request: Request) {
  try {
    if (!isEmailConfigured()) {
      return NextResponse.json(
        { error: "系统未配置邮件服务，请联系管理员" },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const account = typeof body?.account === "string" ? body.account.trim() : "";
    if (!account) {
      return NextResponse.json({ error: "请输入用户名或邮箱" }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: account.toLowerCase() },
          { email: account.toLowerCase() },
        ],
      },
    });

    // 防枚举：账号不存在时返回同样的提示，不区分
    if (!user?.email) {
      return NextResponse.json({ message: "如果该账号存在，验证码已发送至其邮箱" });
    }

    const email = user.email.toLowerCase();

    // 限流：VerificationToken 无 createdAt，用 expires - TTL 反推上次发送时间
    const existing = await prisma.verificationToken.findFirst({
      where: { identifier: email },
    });
    if (existing) {
      const lastSentAt = existing.expires.getTime() - CODE_TTL_MS;
      if (Date.now() - lastSentAt < COOLDOWN_MS) {
        return NextResponse.json(
          { error: "发送过于频繁，请稍后再试" },
          { status: 429 }
        );
      }
    }

    const code = generateCode();
    const expires = new Date(Date.now() + CODE_TTL_MS);

    // 先删旧码再写新码，保证同邮箱只有一条有效记录
    await prisma.$transaction([
      prisma.verificationToken.deleteMany({ where: { identifier: email } }),
      prisma.verificationToken.create({
        data: { identifier: email, token: code, expires },
      }),
    ]);

    try {
      await sendResetCode(email, code);
    } catch (e) {
      // 发送失败回滚验证码，避免留下不可用的脏数据
      await prisma.verificationToken.deleteMany({ where: { identifier: email } });
      console.error("发送验证码邮件失败:", e);
      return NextResponse.json(
        { error: "验证码发送失败，请稍后再试" },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "如果该账号存在，验证码已发送至其邮箱" });
  } catch (error) {
    console.error("发送验证码失败:", error);
    return NextResponse.json(
      { error: "验证码发送失败，请稍后再试" },
      { status: 500 }
    );
  }
}
```

- [ ] **步骤 3：curl 验证请求参数校验**

```bash
curl -s -X POST http://localhost:3000/api/auth/forgot-password -H "Content-Type: application/json" -d "{}"
```

预期：HTTP 400，`{"error":"请输入用户名或邮箱"}`

---

### 任务 3：`POST /api/auth/reset-password`

**文件：**
- 创建：`src/app/api/auth/reset-password/route.ts`

- [ ] **步骤 1：创建 `src/app/api/auth/reset-password/route.ts`**

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const account = typeof body?.account === "string" ? body.account.trim() : "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

    if (!account || !code) {
      return NextResponse.json({ error: "账号和验证码不能为空" }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: "新密码至少6位" }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: account.toLowerCase() },
          { email: account.toLowerCase() },
        ],
      },
    });
    // 与注册一致，Credentials 用户注册时必填邮箱
    if (!user?.email) {
      return NextResponse.json({ error: "账号或验证码不正确" }, { status: 400 });
    }

    const email = user.email.toLowerCase();
    const record = await prisma.verificationToken.findFirst({
      where: { identifier: email },
    });

    if (!record || record.expires.getTime() < Date.now()) {
      if (record) {
        await prisma.verificationToken.deleteMany({ where: { identifier: email } });
      }
      return NextResponse.json(
        { error: "验证码不存在或已过期，请重新获取" },
        { status: 400 }
      );
    }

    if (record.token !== code) {
      return NextResponse.json({ error: "验证码不正确" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          // 递增 tokenVersion：所有已登录设备下次请求时强制下线
          tokenVersion: { increment: 1 },
        },
      }),
      prisma.verificationToken.deleteMany({ where: { identifier: email } }),
    ]);

    return NextResponse.json({ success: true, message: "密码已重置，请使用新密码登录" });
  } catch (error) {
    console.error("重置密码失败:", error);
    return NextResponse.json(
      { error: "重置密码失败，请稍后再试" },
      { status: 500 }
    );
  }
}
```

- [ ] **步骤 2：curl 验证密码长度校验**

```bash
curl -s -X POST http://localhost:3000/api/auth/reset-password -H "Content-Type: application/json" -d "{\"account\":\"admin\",\"code\":\"123456\",\"newPassword\":\"123\"}"
```

预期：HTTP 400，`{"error":"新密码至少6位"}`

- [ ] **步骤 3：curl 验证错误验证码（未发送过验证码时）**

```bash
curl -s -X POST http://localhost:3000/api/auth/reset-password -H "Content-Type: application/json" -d "{\"account\":\"admin\",\"code\":\"000000\",\"newPassword\":\"newpass123\"}"
```

预期：HTTP 400，`{"error":"验证码不存在或已过期，请重新获取"}`

---

### 任务 4：改造 `/reset-pwd` 页面为两阶段找回

**文件：**
- 重写：`src/app/reset-pwd/page.tsx`

- [ ] **步骤 1：重写 `src/app/reset-pwd/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Key, Loader2, ArrowLeft, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import toast from "react-hot-toast";

const COOLDOWN_SECONDS = 60;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [account, setAccount] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const startCooldown = () => {
    setCooldown(COOLDOWN_SECONDS);
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!account.trim()) {
      toast.error("请输入用户名或邮箱");
      return;
    }
    if (cooldown > 0) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account }),
      });
      const data = await res.json();
      if (res.ok) {
        // 使用 API 的统一文案（防枚举：不区分账号是否存在）
        toast.success(data.message || "验证码已发送至你的邮箱");
        setStep(2);
        startCooldown();
      } else {
        toast.error(data.error || "发送失败");
      }
    } catch {
      toast.error("发送失败，请稍后再试");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      toast.error("请输入验证码");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("新密码至少6位");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("两次输入的新密码不一致");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, code, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("密码已重置，请使用新密码登录");
        setTimeout(() => router.push("/login"), 1500);
      } else {
        toast.error(data.error || "重置失败");
      }
    } catch {
      toast.error("重置失败，请稍后再试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-muted/40 via-background to-primary/5 dark:from-background dark:via-background dark:to-background flex items-center justify-center p-4">
      <div className="w-full max-w-[380px]">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary via-sky-500 to-cyan-500 flex items-center justify-center shadow-xl shadow-primary/25">
              <span className="text-white font-bold" style={{ fontFamily: "var(--font-space-grotesk)", fontSize: "18px" }}>ON</span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-space-grotesk)" }}>忘记密码</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {step === 1 ? "输入账号，验证码将发送至注册邮箱" : "输入验证码并设置新密码"}
          </p>
        </div>

        <div className="bg-card/90 dark:bg-card/90 backdrop-blur-xl rounded-3xl border border-border p-6 shadow-2xl shadow-primary/5">
          {step === 1 ? (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">用户名或邮箱</Label>
                <Input
                  type="text"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder="输入用户名或注册邮箱"
                  disabled={isSubmitting}
                  className="h-12 rounded-xl bg-muted/80 dark:bg-muted/50 border-border text-base"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12 rounded-xl text-base font-medium shadow-lg shadow-primary/25 transition-all duration-200"
                disabled={isSubmitting || cooldown > 0}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    发送中...
                  </>
                ) : cooldown > 0 ? (
                  `${cooldown}s 后可重新发送`
                ) : (
                  <>
                    <Mail className="h-5 w-5 mr-2" />
                    发送验证码
                  </>
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
              >
                <ArrowLeft className="h-4 w-4" />
                返回，修改账号
              </button>
              <div className="space-y-2">
                <Label className="text-sm">验证码</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="6 位数字验证码"
                  disabled={isSubmitting}
                  className="h-12 rounded-xl bg-muted/80 dark:bg-muted/50 border-border text-base tracking-[0.3em] text-center"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">新密码</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="输入新密码（至少6位）"
                  disabled={isSubmitting}
                  className="h-12 rounded-xl bg-muted/80 dark:bg-muted/50 border-border text-base"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">确认新密码</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入新密码"
                  disabled={isSubmitting}
                  className="h-12 rounded-xl bg-muted/80 dark:bg-muted/50 border-border text-base"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12 rounded-xl text-base font-medium shadow-lg shadow-primary/25 transition-all duration-200"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    重置中...
                  </>
                ) : (
                  <>
                    <Key className="h-5 w-5 mr-2" />
                    重置密码
                  </>
                )}
              </Button>
            </form>
          )}
        </div>

        <div className="text-center mt-6 space-y-3">
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            返回登录
          </Link>
        </div>

        <p className="text-center mt-4 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-primary transition-colors">
            ← 返回首页
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **步骤 2：浏览器验证流程**

打开 `http://localhost:3000/reset-pwd`：
1. 输入一个**不存在的账号** → 提示"验证码已发送至你的邮箱"并进入阶段 2（防枚举生效）
2. 输入一个**已配置 Resend 后的真实账号** → 邮箱收到验证码邮件 → 输入验证码 + 新密码 → 重置成功 → 跳转登录页 → 用新密码登录成功

---

### 任务 5：登录页文案 + 环境变量文档

**文件：**
- 修改：`src/app/login/page.tsx`（第 182-192 行的链接文案）
- 修改：`.env.example`

- [ ] **步骤 1：修改登录页链接文案**

将 `src/app/login/page.tsx` 中：

```tsx
忘记密码 / 修改密码
```

改为：

```tsx
忘记密码？
```

- [ ] **步骤 2：更新 `.env.example`**

在文件末尾追加：

```bash
# Resend 邮件服务（忘记密码验证码，可选但推荐）
# 1. https://resend.com 免费注册
# 2. Add Domain: nav.hotier.cc.cd，按后台给出的 SPF/DKIM 记录到域名服务商添加 DNS
# 3. 创建 API Key（Sending access，re_ 开头）
# RESEND_API_KEY=re_xxx
# RESEND_FROM=OneNav <noreply@nav.hotier.cc.cd>
```

- [ ] **步骤 3：最终检查**

运行：`npx tsc --noEmit`
预期：无本计划相关新增错误。（注：Next.js 16 已移除 `next lint`，`pnpm lint` 不可用，改用 `npx tsc --noEmit`。）

---

## 用户侧后续操作（计划外）

实现完成后，用户需自行完成（代码已支持，不影响其他功能）：
1. resend.com 注册 → Add Domain `nav.hotier.cc.cd` → 添加 SPF/DKIM DNS 记录 → 验证通过
2. 创建 API Key → 写入 `.env`（或 Vercel 环境变量）`RESEND_API_KEY=re_xxx`、`RESEND_FROM=OneNav <noreply@nav.hotier.cc.cd>`
3. 重启 `pnpm dev`（环境变量生效）→ 实际发送一封验证码邮件验证
