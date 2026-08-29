"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { Users, Shield, Trash2, User, Loader2, AlertTriangle, ChevronDown, Check } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { notifyDataChanged } from "@/lib/cache-client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { proxyImageUrl, cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { useDataCache } from "@/hooks/useDataCache";

interface UserItem {
  id: string;
  name: string | null;
  email: string | null;
  username: string | null;
  image: string | null;
  role: string;
  createdAt: string;
  _count: { links: number };
}

export default function UsersPage() {
  const { data: session, status } = useSession();
  const uid = session?.user?.id;
  const { data: cacheData, loading, syncing: _syncing, setData } = useDataCache({
    configs: [
    { name: "User", fetch: () => fetch("/api/users").then(r => r.json()).then(d => ({ data: d, total: d.length })) },
  ], userId: uid });
  const users = (cacheData["User"] || []) as UserItem[];
  const [deleteTarget, setDeleteTarget] = useState<UserItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [roleMenuUser, setRoleMenuUser] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [roleUpdating, setRoleUpdating] = useState<Record<string, boolean>>({});
  const [roleChangeTarget, setRoleChangeTarget] = useState<{
    userId: string;
    newRole: string;
    name: string;
  } | null>(null);

  const handleRoleToggle = async (userId: string, newRole: string) => {
    setRoleUpdating((prev) => ({ ...prev, [userId]: true }));
    const prevUsers = [...users];
    // 乐观更新 UI
    setData("User", (prev) => (prev as UserItem[]).map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (res.ok) {
        setData("User", (prev) => (prev as UserItem[]).map((u) => (u.id === userId ? { ...u, role: data.role } : u)));
        // 角色变更影响该用户的链接可见范围 → 广播 User（联动 Link/DashboardStats）让已打开页面刷新
        notifyDataChanged("User");
        notifyDataChanged("Link");
        toast.success(`角色已更新为 ${newRole === "admin" ? "管理员" : "普通用户"}`);
      } else {
        // 回滚
        setData("User", () => prevUsers);
        toast.error(data.error || "操作失败");
      }
    } catch {
      setData("User", () => prevUsers);
      toast.error("操作失败");
    } finally {
      setRoleUpdating((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const prevUsers = [...users];
    const target = deleteTarget;
    // 乐观删除
    setData("User", (prev) => (prev as UserItem[]).filter((u) => u.id !== target.id));
    setDeleteTarget(null);

    try {
      const res = await fetch(`/api/users/${target.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        // 删除用户会级联删除其链接 → 双发广播，首页/分类页等已打开页面实时刷新
        notifyDataChanged("User");
        notifyDataChanged("Link");
        toast.success("用户已删除");
      } else {
        // 回滚
        setData("User", () => prevUsers);
        toast.error(data.error || "删除失败");
      }
    } catch {
      setData("User", () => prevUsers);
      toast.error("删除失败");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRoleSelect = (userId: string, currentRole: string, newRole: string) => {
    setRoleMenuUser(null);
    setMenuPosition(null);
    if (newRole === currentRole) return;
    const target = users.find((u) => u.id === userId);
    setRoleChangeTarget({
      userId,
      newRole,
      name: target?.name || target?.username || "未知",
    });
  };

  const confirmRoleChange = async () => {
    if (!roleChangeTarget) return;
    const { userId, newRole } = roleChangeTarget;
    setRoleChangeTarget(null);
    await handleRoleToggle(userId, newRole);
  };

  // 点击菜单外部关闭
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!roleMenuUser) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setRoleMenuUser(null);
        setMenuPosition(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [roleMenuUser]);

  if (status === "loading") return null;

  if (!session || session.user?.role !== "admin") {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-danger-muted flex items-center justify-center mb-4">
            <AlertTriangle className="h-8 w-8 text-danger" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            无权限访问
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            仅管理员可以访问用户管理功能
          </p>
        </div>
      </AdminLayout>
    );
  }

  const adminCount = users.filter((u) => u.role === "admin").length;
  const userCount = users.filter((u) => u.role === "user").length;

  return (
    <AdminLayout>
      <div className="dashboard-container space-y-8">
        {/* Page Header + Stats */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-space-grotesk)" }}>
                  用户管理
                </h1>
                <p className="text-muted-foreground">
                  共 {users.length} 个用户
                </p>
              </div>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="stagger-grid grid gap-4 sm:grid-cols-3">
          <div className="stat-card p-4" style={{ "--icon-color": "#6366f1" } as React.CSSProperties}>
            <p className="text-xs text-muted-foreground mb-1">总用户</p>
            <p className="text-3xl font-bold mb-1 tracking-tight" style={{ fontFamily: "var(--font-space-grotesk)" }}>{users.length}</p>
          </div>
          <div className="stat-card p-4" style={{ "--icon-color": "#8b5cf6" } as React.CSSProperties}>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-3.5 w-3.5 text-violet-500" />
              <p className="text-xs text-muted-foreground">管理员</p>
            </div>
            <p className="text-3xl font-bold mb-1 tracking-tight text-violet-600 dark:text-violet-400" style={{ fontFamily: "var(--font-space-grotesk)" }}>{adminCount}</p>
          </div>
          <div className="stat-card p-4" style={{ "--icon-color": "#94a3b8" } as React.CSSProperties}>
            <div className="flex items-center gap-2 mb-1">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">普通用户</p>
            </div>
            <p className="text-3xl font-bold mb-1 tracking-tight" style={{ fontFamily: "var(--font-space-grotesk)" }}>{userCount}</p>
          </div>
        </div>

        {/* User Table */}
        {loading && users.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users className="size-5" />
              </EmptyMedia>
              <EmptyTitle>暂无用户</EmptyTitle>
              <EmptyDescription>用户注册后将在此处显示</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="animate-fade-in-up delay-300">
          <div className="action-card" style={{ "--accent-color": "#8b5cf6" } as React.CSSProperties}>
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-violet-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1" style={{ fontFamily: "var(--font-space-grotesk)" }}>用户列表</h3>
                <p className="text-sm text-muted-foreground">
                  管理系统中的所有用户
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-border overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-border">
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>用户</TableHead>
                  <TableHead>用户名</TableHead>
                  <TableHead>邮箱</TableHead>
                  <TableHead className="text-center">角色</TableHead>
                  <TableHead className="text-center">书签数</TableHead>
                  <TableHead>注册时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user, index) => {
                  const initials = (user.name || user.username || "?")
                    .slice(0, 2)
                    .toUpperCase();
                  const isMe = user.id === session.user?.id;

                  return (
                  <TableRow
                    key={user.id}
                    className="border-b border-border hover:bg-muted/50 transition-colors"
                  >
                    <TableCell className="text-sm text-muted-foreground font-mono w-12">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className={cn(user.role === "admin" && "admin-avatar-ring")}>
                          {user.image ? (
                            <img
                              src={proxyImageUrl(user.image)}
                              alt=""
                              className={cn(
                                "h-9 w-9 rounded-full object-cover",
                                user.role !== "admin" && "ring-2 ring-muted"
                              )}
                            />
                          ) : (
                            <div className={cn(
                              "h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold",
                              user.role === "admin"
                                ? "bg-gradient-to-br from-primary to-sky-500 text-white"
                                : "bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground"
                            )}>
                              {initials}
                            </div>
                          )}
                          {user.role === "admin" && <span className="admin-avatar-badge">管</span>}
                        </div>
                        <div>
                          <span className="font-medium text-sm text-foreground">
                            {user.name || "未设置"}
                          </span>
                          {isMe && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300">
                              我
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">
                      {user.username || "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                      {user.email || "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="relative inline-block">
                        <button
                          onClick={(e) => {
                            if (roleMenuUser === user.id) {
                              setRoleMenuUser(null);
                              setMenuPosition(null);
                            } else {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setMenuPosition({ top: rect.bottom + 4, left: rect.left + rect.width / 2 });
                              setRoleMenuUser(user.id);
                            }
                          }}
                          disabled={roleUpdating[user.id]}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer",
                            user.role === "admin"
                              ? "bg-violet-50 text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/20 dark:hover:bg-violet-500/20"
                              : "bg-muted text-muted-foreground ring-1 ring-border hover:bg-accent dark:bg-muted dark:text-muted-foreground dark:ring-border dark:hover:bg-accent"
                          )}
                        >
                          {roleUpdating[user.id] ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : user.role === "admin" ? (
                            <Shield className="h-3 w-3" />
                          ) : (
                            <User className="h-3 w-3" />
                          )}
                          {user.role === "admin" ? "管理员" : "普通用户"}
                          <ChevronDown className="h-3 w-3 opacity-50" />
                        </button>
                        {roleMenuUser === user.id && menuPosition && createPortal(
                          <div
                            ref={menuRef}
                            style={{
                              position: "fixed",
                              top: menuPosition.top,
                              left: menuPosition.left,
                              transform: "translateX(-50%)",
                            }}
                            className="z-[9999] min-w-[120px] rounded-lg border border-border bg-card shadow-lg py-1"
                          >
                            {(["admin", "user"] as const).map((r) => (
                              <button
                                key={r}
                                onClick={() => handleRoleSelect(user.id, user.role, r)}
                                disabled={roleUpdating[user.id]}
                                className={cn(
                                  "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-muted",
                                  r === user.role
                                    ? "text-foreground font-medium"
                                    : "text-muted-foreground"
                                )}
                              >
                                {r === "admin" ? (
                                  <Shield className="h-3.5 w-3.5 text-violet-500" />
                                ) : (
                                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                                <span className="flex-1 text-left">
                                  {r === "admin" ? "管理员" : "普通用户"}
                                </span>
                                {r === user.role && (
                                  <Check className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />
                                )}
                              </button>
                            ))}
                          </div>,
                          document.body
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      <span className={cn(
                        "inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-md text-xs font-medium",
                        user._count.links > 0
                          ? "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300"
                          : "text-muted-foreground"
                      )}>
                        {user._count.links}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(user.createdAt).toLocaleDateString("zh-CN", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(user)}
                        title="删除用户"
                        className="h-8 px-2 rounded-lg text-xs font-medium text-danger hover:text-danger hover:bg-danger/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          </div>
          </div>
        )}
      </div>

      {/* Role Change Confirmation Dialog */}
      <Dialog open={!!roleChangeTarget} onOpenChange={() => setRoleChangeTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-violet-500" />
              确认更改角色
            </DialogTitle>
            <DialogDescription className="pt-2">
              <p>
                确定要将用户{" "}
                <strong className="text-foreground">
                  {roleChangeTarget?.name}
                </strong>
                {" "}的角色更改为{" "}
                <strong className={cn(
                  roleChangeTarget?.newRole === "admin"
                    ? "text-violet-600 dark:text-violet-400"
                    : "text-muted-foreground"
                )}>
                  {roleChangeTarget?.newRole === "admin" ? "管理员" : "普通用户"}
                </strong>
                {" "}吗？
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setRoleChangeTarget(null)}
              disabled={!!roleChangeTarget && roleUpdating[roleChangeTarget.userId]}
            >
              取消
            </Button>
            <Button
              onClick={confirmRoleChange}
              disabled={!!roleChangeTarget && roleUpdating[roleChangeTarget.userId]}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {!!roleChangeTarget && roleUpdating[roleChangeTarget.userId] ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Shield className="h-4 w-4 mr-1" />
              )}
              确认更改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              确认删除
            </DialogTitle>
            <DialogDescription className="pt-2">
              <p>
                确定要删除用户{" "}
                <strong className="text-foreground">
                  {deleteTarget?.name || deleteTarget?.username || "未知"}
                </strong>
                {" "}吗？
              </p>
              <p className="mt-2 text-danger text-sm">
                此操作不可撤销，该用户的所有书签将被同时删除。
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" />
              )}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
