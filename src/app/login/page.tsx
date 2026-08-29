"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  User,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Compass,
  ShieldCheck,
} from "lucide-react";
import toast from "react-hot-toast";
import Link from "next/link";
import { cn } from "@/lib/utils";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  // 邮件服务是否已配置：未配置时关闭注册与自助重置密码入口（仅管理员可后台重置）
  const [emailConfigured, setEmailConfigured] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/meta")
      .then((r) => r.json())
      .then((d: { emailConfigured?: boolean }) => {
        if (!cancelled) setEmailConfigured(d.emailConfigured !== false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const COOLDOWN_SECONDS = 60;

  const switchMode = (nextLogin: boolean) => {
    if (nextLogin === isLogin) return;
    setIsLogin(nextLogin);
    setPassword("");
    setConfirmPassword("");
    setCode("");
  };

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

  const handleSendCode = async () => {
    const email = name.trim().toLowerCase();
    if (!email) {
      toast.error("请输入邮箱");
      return;
    }
    if (!EMAIL_REGEX.test(email)) {
      toast.error("请输入正确的邮箱");
      return;
    }
    if (cooldown > 0 || isSending) return;

    setIsSending(true);
    try {
      const res = await fetch("/api/auth/send-register-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "验证码已发送至你的邮箱");
        // 发送成功后才开始 60s 倒计时
        startCooldown();
      } else {
        toast.error(data.error || "发送失败");
      }
    } catch {
      toast.error("发送失败，请稍后再试");
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error("请输入用户名和密码");
      return;
    }
    if (!isLogin && !code.trim()) {
      toast.error("请输入邮箱验证码");
      return;
    }
    if (!isLogin && password !== confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }

    setIsLoading(true);
    try {
      if (isLogin) {
        const result = await signIn("credentials", {
          username,
          password,
          redirect: false,
        });

        if (result?.error) {
          toast.error("用户名或密码错误");
        } else {
          toast.success("登录成功");
          router.push(callbackUrl);
          router.refresh();
        }
      } else {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email: name, password, code }),
        });

        const data = await response.json();

        if (response.ok) {
          toast.success("注册成功，请登录");
          switchMode(true);
        } else {
          toast.error(data.error || "注册失败");
        }
      }
    } catch {
      toast.error(isLogin ? "登录失败" : "注册失败");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthLogin = (provider: string) => {
    signIn(provider, { callbackUrl });
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-sky-50 via-white to-cyan-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4">
      {/* 背景装饰光斑 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-32 -left-32 h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-sky-300/40 to-cyan-300/20 dark:from-sky-500/20 dark:to-cyan-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-32 h-[32rem] w-[32rem] rounded-full bg-gradient-to-tr from-blue-300/40 to-indigo-300/20 dark:from-blue-500/20 dark:to-indigo-500/10 blur-3xl" />
        <div className="absolute top-1/3 right-1/4 h-72 w-72 rounded-full bg-gradient-to-br from-cyan-200/30 to-blue-200/20 dark:from-cyan-500/10 dark:to-blue-500/5 blur-3xl" />
        {/* 网格底纹 */}
        <div
          className="absolute inset-0 opacity-[0.35] dark:opacity-[0.15]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            color: "rgb(148 163 184)",
            maskImage:
              "radial-gradient(ellipse at center, black 30%, transparent 75%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          }}
        />
      </div>

      <div className="relative w-full max-w-[440px]">
        {/* 品牌区 */}
        <div className="text-center mb-8">
          <div className="relative inline-flex mb-5">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-500 blur-2xl opacity-50" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-blue-500 to-cyan-500 shadow-2xl shadow-sky-500/30">
              <Compass className="h-7 w-7 text-white" strokeWidth={2.2} />
            </div>
          </div>
          <h1
            className="text-3xl font-bold tracking-tight bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900 dark:from-white dark:via-slate-200 dark:to-white bg-clip-text text-transparent"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            OneNav
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            简洁高效的书签管理工具
          </p>
        </div>

        {/* 卡片 */}
        <div className="relative">
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-sky-500/20 via-cyan-500/20 to-blue-500/20 blur-xl opacity-60" aria-hidden />
          <Card className="relative border-border/60 shadow-2xl shadow-sky-500/5 backdrop-blur-xl bg-card/95 dark:bg-card/95 rounded-3xl overflow-hidden">
            <CardContent className="p-7 sm:p-8">
              {/* 模式切换 pill */}
              <div className="mb-6 flex justify-center">
                <div
                  role="tablist"
                  aria-label="登录模式切换"
                  className="inline-flex p-1 rounded-full bg-muted/60 dark:bg-muted/30 border border-border/40"
                >
                  {(emailConfigured
                    ? [
                        { key: true, label: "登录" },
                        { key: false, label: "注册" },
                      ]
                    : [{ key: true, label: "登录" }]
                  ).map((opt) => (
                    <button
                      key={String(opt.key)}
                      type="button"
                      role="tab"
                      aria-selected={isLogin === opt.key}
                      onClick={() => switchMode(opt.key)}
                      className={cn(
                        "px-6 py-1.5 text-sm font-medium rounded-full transition-all duration-200",
                        isLogin === opt.key
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 标题区 */}
              <div className="mb-6 text-center">
                <h2 className="text-xl font-semibold text-foreground">
                  {isLogin ? "欢迎回来" : "创建账号"}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {isLogin
                    ? "登录以继续管理你的书签"
                    : "验证邮箱后即可开启书签之旅"}
                </p>
              </div>

              {/* 表单 */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder={isLogin ? "用户名 / 邮箱" : "用户名"}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isLoading}
                    autoComplete="username"
                    className="h-12 pl-11 rounded-xl bg-muted/40 dark:bg-muted/20 border-border/60 text-base placeholder:text-sm"
                  />
                </div>

                {!isLogin && (
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="邮箱"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={isLoading}
                      autoComplete="email"
                      className="h-12 pl-11 rounded-xl bg-muted/40 dark:bg-muted/20 border-border/60 text-base placeholder:text-sm"
                    />
                  </div>
                )}

                {!isLogin && (
                  <div className="relative">
                    <ShieldCheck className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="验证码"
                      value={code}
                      onChange={(e) =>
                        setCode(e.target.value.replace(/\D/g, ""))
                      }
                      disabled={isLoading}
                      className="h-12 pl-11 pr-[7.5rem] rounded-xl bg-muted/40 dark:bg-muted/20 border-border/60 text-base tracking-[0.3em] font-mono [&::placeholder]:tracking-normal [&::placeholder]:font-sans [&::placeholder]:text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleSendCode}
                      disabled={cooldown > 0 || isSending || isLoading}
                      className={cn(
                        "absolute right-1.5 top-1/2 -translate-y-1/2 h-9 px-3.5 rounded-lg text-xs font-semibold transition-all",
                        cooldown > 0
                          ? "text-muted-foreground cursor-not-allowed"
                          : "text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 active:scale-[0.97]"
                      )}
                    >
                      {isSending ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                          发送中
                        </span>
                      ) : cooldown > 0 ? (
                        `${cooldown}s 后重发`
                      ) : (
                        "获取验证码"
                      )}
                    </button>
                  </div>
                )}

                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    className="h-12 pl-11 pr-11 rounded-xl bg-muted/40 dark:bg-muted/20 border-border/60 text-base placeholder:text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {!isLogin && (
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="确认密码"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={isLoading}
                      autoComplete="new-password"
                      className="h-12 pl-11 pr-11 rounded-xl bg-muted/40 dark:bg-muted/20 border-border/60 text-base placeholder:text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                      tabIndex={-1}
                      aria-label={showPassword ? "隐藏密码" : "显示密码"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                )}

                {isLogin && emailConfigured && (
                  <div className="flex justify-end -mt-1">
                    <Link
                      href="/reset-pwd"
                      className="text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      忘记密码？
                    </Link>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 rounded-xl text-base font-semibold bg-gradient-to-r from-sky-500 via-blue-500 to-cyan-500 hover:from-sky-600 hover:via-blue-600 hover:to-cyan-600 shadow-lg shadow-sky-500/25 hover:shadow-xl hover:shadow-sky-500/35 transition-all duration-200 group text-white"
                >
                  {isLoading ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      {isLogin ? "登录中..." : "注册中..."}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      {isLogin ? "登录" : "创建账号"}
                    </span>
                  )}
                </Button>
              </form>

              {/* 分隔线 */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center" aria-hidden>
                  <span className="w-full h-px bg-border/60" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-card px-3 text-xs text-muted-foreground">
                    或使用社交账号
                  </span>
                </div>
              </div>

              {/* GitHub */}
              <Button
                type="button"
                variant="outline"
                className="w-full h-12 rounded-xl text-base font-medium border-border/60 hover:bg-muted/60 transition-colors"
                onClick={() => handleOAuthLogin("github")}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-5 w-5 mr-2"
                  aria-hidden="true"
                >
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
                继续使用 GitHub
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* 底部 */}
        <p className="text-center mt-6 text-xs text-muted-foreground">
          <Link
            href="/"
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            ← 返回首页
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
