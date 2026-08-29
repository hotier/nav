"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Key, Sparkles, Save } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { proxyImageUrl } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import toast from "react-hot-toast";

export default function SettingsPage() {
  const { data: session } = useSession();

  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiEndpoint, setOpenaiEndpoint] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Load settings from localStorage
    setOpenaiKey(localStorage.getItem("openai_key") || "");
    setOpenaiEndpoint(
      localStorage.getItem("openai_endpoint") || "https://api.openai.com/v1"
    );
  }, []);

  const handleSaveSettings = () => {
    setIsSaving(true);

    try {
      localStorage.setItem("openai_key", openaiKey);
      localStorage.setItem("openai_endpoint", openaiEndpoint);
      toast.success("设置已保存");
    } catch {
      toast.error("保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  const stats = {
    totalLinks: 0,
    totalCategories: 0,
    publicLinks: 0,
    privateLinks: 0,
  };

  return (
    <AdminLayout stats={stats}>
      <div className="dashboard-container space-y-8">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-space-grotesk)" }}>设置</h1>
          <p className="text-muted-foreground">管理您的应用设置</p>
        </div>

        {/* Stats Cards */}
        <div className="hidden md:flex items-center gap-3 animate-fade-in-up delay-200">
          <div className="glass-effect rounded-full px-4 py-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium">AI 功能已启用</span>
          </div>
          <div className="glass-effect rounded-full px-4 py-2 flex items-center gap-2">
            <Key className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">本地存储</span>
          </div>
        </div>

        {/* AI Settings */}
        <div className="animate-fade-in-up delay-300">
        <div className="action-card" style={{ "--accent-color": "#f59e0b" } as React.CSSProperties}>
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Sparkles className="h-6 w-6 text-amber-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1" style={{ fontFamily: "var(--font-space-grotesk)" }}>AI 设置</h3>
              <p className="text-sm text-muted-foreground">
                配置 AI 搜索功能，支持 OpenAI 兼容 API
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="openai_endpoint">API Endpoint</Label>
              <Input
                id="openai_endpoint"
                value={openaiEndpoint}
                onChange={(e) => setOpenaiEndpoint(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                支持 OpenAI 兼容的 API 地址，如 OpenAI、Azure、SiliconFlow 等
              </p>
            </div>

            <div>
              <Label htmlFor="openai_key">API Key</Label>
              <Input
                id="openai_key"
                type="password"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder="sk-..."
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                您的 API Key 将仅保存在浏览器本地
              </p>
            </div>

            <div className="pt-4">
              <Button onClick={handleSaveSettings} disabled={isSaving}>
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? "保存中..." : "保存设置"}
              </Button>
            </div>
          </div>
        </div>
        </div>

        {/* Account Info */}
        <div className="animate-fade-in-up delay-400">
        <div className="action-card" style={{ "--accent-color": "#3b82f6" } as React.CSSProperties}>
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Key className="h-6 w-6 text-primary" />
          </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1" style={{ fontFamily: "var(--font-space-grotesk)" }}>账户信息</h3>
              <p className="text-sm text-muted-foreground">当前登录账户</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              {session?.user?.image && (
                <img
                  src={proxyImageUrl(session.user.image, 128)}
                  alt=""
                  className="h-10 w-10 rounded-full"
                />
              )}
              <div>
                <p className="font-medium">{session?.user?.name}</p>
                <p className="text-sm text-muted-foreground">
                  {session?.user?.email}
                </p>
              </div>
            </div>
          </div>
        </div>
        </div>

        {/* Theme Settings */}
        <div className="animate-fade-in-up delay-500">
        <div className="action-card" style={{ "--accent-color": "#8b5cf6" } as React.CSSProperties}>
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Key className="h-6 w-6 text-violet-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1" style={{ fontFamily: "var(--font-space-grotesk)" }}>外观</h3>
              <p className="text-sm text-muted-foreground">自定义应用外观</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            点击右上角的主题切换按钮，可以在浅色、深色和系统主题之间切换
          </p>
        </div>
        </div>
      </div>
    </AdminLayout>
  );
}
