"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Users, Shield, Trash2, User, Loader2, AlertTriangle } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
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
  const [users, setUsers] = useState<UserItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<UserItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [roleUpdating, setRoleUpdating] = useState<Record<string, boolean>>({});

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch {
      toast.error("获取用户列表失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchUsers();
    }
  }, [status, fetchUsers]);

  const handleRoleToggle = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    setRoleUpdating((prev) => ({ ...prev, [userId]: true }));
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: data.role } : u))
        );
        toast.success(`角色已更新为 ${newRole === "admin" ? "管理员" : "普通用户"}`);
      } else {
        toast.error(data.error || "操作失败");
      }
    } catch {
      toast.error("操作失败");
    } finally {
      setRoleUpdating((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
        toast.success("用户已删除");
      } else {
        toast.error(data.error || "删除失败");
      }
    } catch {
      toast.error("删除失败");
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (status === "loading") return null;

  if (!session || session.user?.role !== "admin") {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-500/10 flex items-center justify-center mb-4">
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">
            无权限访问
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
            仅管理员可以访问用户管理功能
          </p>
        </div>
      </AdminLayout>
    );
  }

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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-500/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
                用户管理
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                共 {users.length} 个用户
              </p>
            </div>
          </div>
        </div>

        {/* User Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
              <Users className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">
              暂无用户
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              用户注册后将在此处显示
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 overflow-hidden bg-white dark:bg-slate-900/50">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-slate-200 dark:border-slate-700/60">
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
                {users.map((user, index) => (
                  <TableRow
                    key={user.id}
                    className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <TableCell className="text-sm text-slate-400 font-mono">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {user.image ? (
                          <img
                            src={proxyImageUrl(user.image)}
                            alt=""
                            className="h-8 w-8 rounded-full ring-2 ring-slate-100 dark:ring-slate-700"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                            <User className="h-4 w-4 text-slate-400" />
                          </div>
                        )}
                        <span className="font-medium text-sm text-slate-800 dark:text-white">
                          {user.name || "未设置"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600 dark:text-slate-400 font-mono">
                      {user.username || "-"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                      {user.email || "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium",
                          user.role === "admin"
                            ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                        )}
                      >
                        {user.role === "admin" && <Shield className="h-3 w-3" />}
                        {user.role === "admin" ? "管理员" : "普通用户"}
                      </span>
                    </TableCell>
                    <TableCell className="text-center text-sm text-slate-600 dark:text-slate-400">
                      {user._count.links}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {new Date(user.createdAt).toLocaleDateString("zh-CN")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {user.id !== session.user?.id ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRoleToggle(user.id, user.role)}
                              disabled={roleUpdating[user.id]}
                              className={cn(
                                "text-xs h-8",
                                user.role === "admin"
                                  ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-500/10"
                                  : "text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-500/10"
                              )}
                            >
                              {roleUpdating[user.id] ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : user.role === "admin" ? (
                                "降为普通"
                              ) : (
                                "升为管理"
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteTarget(user)}
                              className="text-xs h-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            当前用户
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

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
                <strong className="text-slate-800 dark:text-slate-200">
                  {deleteTarget?.name || deleteTarget?.username || "未知"}
                </strong>
                {" "}吗？
              </p>
              <p className="mt-2 text-red-500 dark:text-red-400 text-sm">
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
