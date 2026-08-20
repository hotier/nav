"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Key, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import toast from "react-hot-toast";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword) {
      toast.error("请输入当前密码");
      return;
    }
    if (!newPassword) {
      toast.error("请输入新密码");
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
      const res = await fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (res.ok) {
        toast.success("密码已修改，请重新登录");
        setTimeout(() => signOut({ callbackUrl: "/login" }), 1500);
      } else {
        const err = await res.json();
        toast.error(err.error || "修改密码失败");
      }
    } catch {
      toast.error("修改密码失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-muted/40 via-background to-primary/5 dark:from-background dark:via-background dark:to-background flex items-center justify-center p-4">
      <div className="w-full max-w-[380px]">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary via-sky-500 to-cyan-500 flex items-center justify-center shadow-xl shadow-primary/25">
              <span className="text-white font-bold" style={{ fontFamily: "var(--font-space-grotesk)", fontSize: "18px" }}>ON</span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-space-grotesk)" }}>修改密码</h1>
          <p className="text-muted-foreground mt-1 text-sm">保护你的账户安全</p>
        </div>

        {/* Password Card */}
        <div className="bg-card/90 dark:bg-card/90 backdrop-blur-xl rounded-3xl border border-border p-6 shadow-2xl shadow-primary/5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">当前密码</Label>
              <div className="relative">
                <Input
                  type={showPassword.current ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="输入当前密码"
                  disabled={isSubmitting}
                  className="h-12 rounded-xl bg-muted/80 dark:bg-muted/50 border-border text-base pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => ({ ...s, current: !s.current }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword.current ? "隐藏" : "显示"}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">新密码</Label>
              <div className="relative">
                <Input
                  type={showPassword.new ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="输入新密码（至少6位）"
                  disabled={isSubmitting}
                  className="h-12 rounded-xl bg-muted/80 dark:bg-muted/50 border-border text-base pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => ({ ...s, new: !s.new }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword.new ? "隐藏" : "显示"}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">确认新密码</Label>
              <div className="relative">
                <Input
                  type={showPassword.confirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入新密码"
                  disabled={isSubmitting}
                  className="h-12 rounded-xl bg-muted/80 dark:bg-muted/50 border-border text-base pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => ({ ...s, confirm: !s.confirm }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword.confirm ? "隐藏" : "显示"}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 rounded-xl text-base font-medium shadow-lg shadow-primary/25 transition-all duration-200"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  修改中...
                </>
              ) : (
                <>
                  <Key className="h-5 w-5 mr-2" />
                  修改密码
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Links */}
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
