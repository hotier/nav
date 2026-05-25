"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Github } from "lucide-react";
import toast from "react-hot-toast";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error("请输入用户名和密码");
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
          body: JSON.stringify({ username, email: name, password }),
        });

        const data = await response.json();

        if (response.ok) {
          toast.success("注册成功，请登录");
          setIsLogin(true);
          setPassword("");
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-[360px]">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 via-sky-500 to-cyan-500 flex items-center justify-center shadow-xl shadow-blue-500/25">
              <span className="text-white font-bold" style={{ fontFamily: "var(--font-space-grotesk)", fontSize: "18px" }}>ON</span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white" style={{ fontFamily: "var(--font-space-grotesk)" }}>OneNav</h1>
          <p className="text-slate-400 dark:text-slate-400 mt-1 text-sm">书签管理系统</p>
        </div>

        {/* Login Card */}
        <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl rounded-3xl border border-slate-200/60 dark:border-slate-700/60 p-6 shadow-2xl shadow-blue-500/5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="text"
                placeholder="用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                className="h-12 rounded-xl bg-slate-50/80 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 text-base"
              />
            </div>

            {!isLogin && (
              <div>
                <Input
                  type="email"
                  placeholder="邮箱（用于找回密码）"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isLoading}
                  className="h-12 rounded-xl bg-slate-50/80 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 text-base"
                />
              </div>
            )}

            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="h-12 rounded-xl bg-slate-50/80 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 text-base pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>

            <Button
              type="submit"
              className="w-full h-12 rounded-xl text-base font-medium bg-gradient-to-r from-blue-500 to-sky-500 hover:from-blue-600 hover:to-sky-600 shadow-lg shadow-blue-500/25 transition-all duration-200"
              disabled={isLoading}
            >
              {isLoading ? (isLogin ? "登录中..." : "注册中...") : isLogin ? "登 录" : "注 册"}
            </Button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full h-px bg-slate-200 dark:bg-slate-700" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white/90 dark:bg-slate-800/90 px-3 text-xs text-slate-400 dark:text-slate-400">或其他方式</span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full h-12 rounded-xl text-base font-medium border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50"
            onClick={() => handleOAuthLogin("github")}
          >
            <Github className="h-5 w-5 mr-2" />
            GitHub
          </Button>
        </div>

        {/* Toggle */}
        <div className="text-center mt-6">
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setPassword("");
            }}
            className="text-sm text-slate-500 dark:text-slate-400 hover:text-blue-500 transition-colors"
          >
            {isLogin ? "还没有账号？立即注册" : "已有账号？去登录"}
          </button>
        </div>

        {/* 修改密码入口 */}
        {isLogin && (
          <div className="text-center mt-3">
            <Link
              href="/reset-pwd"
              className="text-xs text-slate-400 dark:text-slate-400 hover:text-blue-500 transition-colors"
            >
              忘记密码 / 修改密码
            </Link>
          </div>
        )}

        {/* Back to home */}
        <p className="text-center mt-4 text-sm text-slate-400 dark:text-slate-400">
          <Link href="/" className="hover:text-blue-500 transition-colors">
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
