"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { User, Calendar, Key, Save } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { proxyImageUrl } from "@/lib/utils";
import toast from "react-hot-toast";

interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  username: string | null;
  image: string | null;
  createdAt: string;
  _count: { links: number };
}

export default function AccountPage() {
  const { update } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 表单
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [image, setImage] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    // 从 localStorage 预加载，避免首次加载空白
    try {
      const cached = localStorage.getItem("nav_profile_cache");
      if (cached) {
        const data: Profile = JSON.parse(cached);
        setProfile(data);
        setName(data.name || "");
        setEmail(data.email || "");
        setImage(data.image || "");
      }
    } catch { /* ignore */ }
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await fetch("/api/account");
      if (res.ok) {
        const data: Profile = await res.json();
        setProfile(data);
        setName(data.name || "");
        setEmail(data.email || "");
        setImage(data.image || "");
        try { localStorage.setItem("nav_profile_cache", JSON.stringify(data)); } catch { /* ignore */ }
      }
    } catch {
      toast.error("获取账户信息失败");
    }
  };

  const handleUpdateProfile = async () => {
    setIsSaving(true);
    try {
      const body: Record<string, string> = {};
      if (name !== (profile?.name || "")) body.name = name;
      if (email !== (profile?.email || "")) body.email = email;
      if (image !== (profile?.image || "")) body.image = image;

      if (Object.keys(body).length === 0) {
        toast.error("没有修改任何信息");
        setIsSaving(false);
        return;
      }

      const res = await fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const updated = await res.json();
        setProfile(updated);
        await update(body); // 传入变更数据，JWT callback 即时更新 session
        toast.success("个人信息已更新");
      } else {
        const err = await res.json();
        toast.error(err.error || "更新失败");
      }
    } catch {
      toast.error("更新失败");
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
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

    setIsSaving(true);
    try {
      const res = await fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (res.ok) {
        toast.success("密码已修改，请重新登录");
        // 延迟退出，让用户看到提示
        setTimeout(() => signOut({ callbackUrl: "/login" }), 1500);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        const err = await res.json();
        toast.error(err.error || "修改密码失败");
      }
    } catch {
      toast.error("修改密码失败");
    } finally {
      setIsSaving(false);
    }
  };

  const stats = {
    totalLinks: profile?._count?.links || 0,
    totalCategories: 0,
    publicLinks: 0,
    privateLinks: 0,
  };

  return (
    <AdminLayout stats={stats}>
      <div className="dashboard-container space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <User className="h-5 w-5 text-violet-500" />
          </div>
          <div>
            <h2
              className="text-xl font-semibold"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              账户管理
            </h2>
            <p className="text-sm text-muted-foreground">管理你的个人信息和安全设置</p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* 基本信息 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4" />
                基本信息
              </CardTitle>
              <CardDescription>修改你的名称、邮箱和头像</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 头像 */}
              <div className="space-y-3">
                <Label>头像</Label>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    {image ? (
                      <img
                        src={proxyImageUrl(image)}
                        alt="头像预览"
                        className="w-16 h-16 rounded-full object-cover border-2 border-border"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-sky-500 flex items-center justify-center text-white text-xl font-medium">
                        {profile?.name?.[0]?.toUpperCase() || profile?.username?.[0]?.toUpperCase() || "U"}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <Input
                      value={image}
                      onChange={(e) => setImage(e.target.value)}
                      placeholder="输入头像图片URL，留空使用字母头像"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      前往{" "}
                      <a
                        href="https://img.hotier.cc.cd/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        img.hotier.cc.cd
                      </a>
                      {" "}上传头像，获取图片URL
                    </p>
                    {image && (
                      <button
                        type="button"
                        onClick={() => setImage("")}
                        className="text-xs text-muted-foreground hover:text-red-500 mt-1"
                      >
                        清除头像
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {/* 用户名（只读） */}
              <div className="space-y-2">
                <Label>用户名</Label>
                <Input
                  value={profile?.username || ""}
                  disabled
                  className="bg-muted/50"
                />
                <p className="text-xs text-muted-foreground">
                  用户名不可修改
                </p>
              </div>

              {/* 名称 */}
              <div className="space-y-2">
                <Label>显示名称</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="输入显示名称"
                />
              </div>

              {/* 邮箱 */}
              <div className="space-y-2">
                <Label>邮箱</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                <Calendar className="h-3 w-3" />
                注册时间：{profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString("zh-CN") : "-"}
              </div>

              <Button onClick={handleUpdateProfile} disabled={isSaving} className="w-full">
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? "保存中..." : "保存个人信息"}
              </Button>
            </CardContent>
          </Card>

          {/* 修改密码 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Key className="h-4 w-4" />
                修改密码
              </CardTitle>
              <CardDescription>
                {profile?.username
                  ? "修改你的登录密码"
                  : "OAuth 用户请通过对应平台修改密码"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {profile?.username ? (
                <>
                  <div className="space-y-2">
                    <Label>当前密码</Label>
                    <Input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="输入当前密码"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>新密码</Label>
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="输入新密码（至少6位）"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>确认新密码</Label>
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="再次输入新密码"
                    />
                  </div>
                  <Button
                    onClick={handleChangePassword}
                    disabled={isSaving}
                    className="w-full"
                    variant="secondary"
                  >
                    <Key className="h-4 w-4 mr-2" />
                    {isSaving ? "修改中..." : "修改密码"}
                  </Button>
                </>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <p className="text-sm text-muted-foreground">
                    你是通过 OAuth 登录的，无需密码。请前往对应平台管理账户安全。
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
