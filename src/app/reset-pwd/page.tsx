"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Key,
  ArrowLeft,
  Mail,
  Lock,
  ShieldCheck,
  Check,
  CircleAlert,
  Compass,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

const COOLDOWN_SECONDS = 60;

const STEPS = [
  { n: 1, label: "验证邮箱" },
  { n: 2, label: "设置新密码" },
] as const;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [account, setAccount] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  // 邮件服务是否已配置：未配置时自助重置密码关闭，仅支持管理员后台重置
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
    const email = account.trim().toLowerCase();
    if (!email) {
      toast.error("请输入注册邮箱");
      return;
    }
    if (!EMAIL_REGEX.test(email)) {
      toast.error("请输入正确的邮箱");
      return;
    }
    if (cooldown > 0 || isSending) return;

    setIsSending(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
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

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = account.trim().toLowerCase();
    if (!email) {
      toast.error("请输入注册邮箱");
      return;
    }
    if (!EMAIL_REGEX.test(email)) {
      toast.error("请输入正确的邮箱");
      return;
    }
    if (!code.trim()) {
      toast.error("请输入验证码");
      return;
    }

    setIsVerifying(true);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (res.ok) {
        setResetToken(data.token);
        toast.success("邮箱验证成功");
        setStep(2);
      } else {
        toast.error(data.error || "验证失败");
      }
    } catch {
      toast.error("验证失败，请稍后再试");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
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
        body: JSON.stringify({ token: resetToken, newPassword }),
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

  // 邮件未配置：自助重置密码未开放，引导用户联系管理员
  if (!emailConfigured) {
    return (
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-sky-50 via-white to-cyan-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4">
        {/* 背景装饰 */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute -top-32 -left-32 h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-sky-300/40 to-cyan-300/20 dark:from-sky-500/20 dark:to-cyan-500/10 blur-3xl" />
          <div className="absolute -bottom-40 -right-32 h-[32rem] w-[32rem] rounded-full bg-gradient-to-tr from-blue-300/40 to-indigo-300/20 dark:from-blue-500/20 dark:to-indigo-500/10 blur-3xl" />
          <div className="absolute top-1/3 right-1/4 h-72 w-72 rounded-full bg-gradient-to-br from-cyan-200/30 to-blue-200/20 dark:from-cyan-500/10 dark:to-blue-500/5 blur-3xl" />
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
              重置密码以恢复账号访问
            </p>
          </div>

          <Card className="relative border-border/60 shadow-2xl shadow-sky-500/5 backdrop-blur-xl bg-card/95 dark:bg-card/95 rounded-3xl overflow-hidden">
            <CardContent className="p-7 sm:p-8 text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10">
                <CircleAlert className="h-7 w-7 text-amber-500" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">
                未开放自助重置密码
              </h2>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                当前系统未配置邮件服务，无法发送验证码。
                <br />
                如需重置密码，请联系站点管理员在后台为你重置。
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-1 mt-6 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                返回登录
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-sky-50 via-white to-cyan-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4">
      {/* 背景装饰 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-32 -left-32 h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-sky-300/40 to-cyan-300/20 dark:from-sky-500/20 dark:to-cyan-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-32 h-[32rem] w-[32rem] rounded-full bg-gradient-to-tr from-blue-300/40 to-indigo-300/20 dark:from-blue-500/20 dark:to-indigo-500/10 blur-3xl" />
        <div className="absolute top-1/3 right-1/4 h-72 w-72 rounded-full bg-gradient-to-br from-cyan-200/30 to-blue-200/20 dark:from-cyan-500/10 dark:to-blue-500/5 blur-3xl" />
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
            重置密码以恢复账号访问
          </p>
        </div>

        {/* 步骤指示器 */}
        <ol
          className="mb-6 flex items-center justify-center gap-2 text-xs"
          aria-label="重置密码步骤"
        >
          {STEPS.map((s, i) => {
            const isActive = step === s.n;
            const isDone = step > s.n;
            return (
              <li key={s.n} className="flex items-center">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold border transition-all",
                      isDone
                        ? "bg-gradient-to-br from-sky-500 to-cyan-500 border-transparent text-white"
                        : isActive
                        ? "bg-background text-foreground border-sky-500 shadow-sm"
                        : "bg-muted/40 text-muted-foreground border-border"
                    )}
                  >
                    {isDone ? <Check className="h-3.5 w-3.5" /> : s.n}
                  </div>
                  <span
                    className={cn(
                      "font-medium",
                      isActive || isDone
                        ? "text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <span
                    className={cn(
                      "mx-2 h-px w-6 sm:w-8",
                      step > s.n ? "bg-sky-500/60" : "bg-border"
                    )}
                    aria-hidden
                  />
                )}
              </li>
            );
          })}
        </ol>

        {/* 卡片 */}
        <div className="relative">
          <div
            className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-sky-500/20 via-cyan-500/20 to-blue-500/20 blur-xl opacity-60"
            aria-hidden
          />
          <Card className="relative border-border/60 shadow-2xl shadow-sky-500/5 backdrop-blur-xl bg-card/95 dark:bg-card/95 rounded-3xl overflow-hidden">
            <CardContent className="p-7 sm:p-8">
              {step === 1 && (
                <>
                  <div className="mb-6 text-center">
                    <h2 className="text-xl font-semibold text-foreground">
                      邮箱验证
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      输入注册邮箱获取验证码，验证通过后即可重置密码
                    </p>
                  </div>
                  <form onSubmit={handleVerifyCode} className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">
                        注册邮箱
                      </Label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          value={account}
                          onChange={(e) => setAccount(e.target.value)}
                          placeholder="输入注册邮箱"
                          disabled={isVerifying}
                          className="h-12 pl-11 rounded-xl bg-muted/40 dark:bg-muted/20 border-border/60 text-base placeholder:text-sm"
                        />
                      </div>
                      {account.trim() !== "" &&
                        !EMAIL_REGEX.test(account.trim()) && (
                          <p
                            role="status"
                            className="flex items-center gap-1.5 text-xs mt-1.5 text-red-500 dark:text-red-400"
                          >
                            <CircleAlert className="h-3.5 w-3.5 shrink-0" />
                            请输入正确的邮箱
                          </p>
                        )}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">
                        邮箱验证码
                      </Label>
                      <div className="relative">
                        <ShieldCheck className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={code}
                          onChange={(e) =>
                            setCode(e.target.value.replace(/\D/g, ""))
                          }
                          placeholder="验证码"
                          disabled={isVerifying}
                          className="h-12 pl-11 pr-[7.5rem] rounded-xl bg-muted/40 dark:bg-muted/20 border-border/60 text-base tracking-[0.3em] font-mono [&::placeholder]:tracking-normal [&::placeholder]:font-sans [&::placeholder]:text-sm"
                        />
                        <button
                          type="button"
                          onClick={handleSendCode}
                          disabled={cooldown > 0 || isSending || isVerifying}
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
                    </div>

                    <Button
                      type="submit"
                      disabled={isVerifying}
                      className="w-full h-12 rounded-xl text-base font-semibold bg-gradient-to-r from-sky-500 via-blue-500 to-cyan-500 hover:from-sky-600 hover:via-blue-600 hover:to-cyan-600 shadow-lg shadow-sky-500/25 hover:shadow-xl hover:shadow-sky-500/35 transition-all duration-200 text-white"
                    >
                      {isVerifying ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                          验证中...
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4" />
                          验证并继续
                        </span>
                      )}
                    </Button>

                    <p className="text-center text-xs text-muted-foreground">
                      未收到验证码？请检查垃圾邮件或稍后重试
                    </p>
                  </form>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="mb-6 text-center">
                    <h2 className="text-xl font-semibold text-foreground">
                      设置新密码
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      邮箱已通过验证，为{" "}
                      <span className="text-foreground font-medium">
                        {account}
                      </span>{" "}
                      设置新密码
                    </p>
                  </div>
                  <form onSubmit={handleReset} className="space-y-4">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      返回上一步
                    </button>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">
                        新密码
                      </Label>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="输入新密码（至少6位）"
                          disabled={isSubmitting}
                          autoFocus
                          className="h-12 pl-11 rounded-xl bg-muted/40 dark:bg-muted/20 border-border/60 text-base placeholder:text-sm"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">
                        确认新密码
                      </Label>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="再次输入新密码"
                          disabled={isSubmitting}
                          className="h-12 pl-11 rounded-xl bg-muted/40 dark:bg-muted/20 border-border/60 text-base placeholder:text-sm"
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full h-12 rounded-xl text-base font-semibold bg-gradient-to-r from-sky-500 via-blue-500 to-cyan-500 hover:from-sky-600 hover:via-blue-600 hover:to-cyan-600 shadow-lg shadow-sky-500/25 hover:shadow-xl hover:shadow-sky-500/35 transition-all duration-200 text-white"
                    >
                      {isSubmitting ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                          重置中...
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <Key className="h-4 w-4" />
                          重置密码
                        </span>
                      )}
                    </Button>
                  </form>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 底部 */}
        <p className="text-center mt-6 text-xs text-muted-foreground">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回登录
          </Link>
        </p>
      </div>
    </div>
  );
}
