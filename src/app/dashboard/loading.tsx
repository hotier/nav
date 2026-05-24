import { AdminLayout } from "@/components/AdminLayout";

export default function DashboardLoading() {
  return (
    <AdminLayout>
      <div className="space-y-6 animate-pulse">
        {/* 统计卡片骨架 */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
              <div className="h-4 w-16 rounded bg-muted" />
              <div className="h-8 w-12 rounded bg-muted" />
              <div className="h-3 w-24 rounded bg-muted" />
            </div>
          ))}
        </div>

        {/* 快捷操作骨架 */}
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
              <div className="h-8 w-8 rounded-lg bg-muted" />
              <div className="h-4 w-20 rounded bg-muted" />
              <div className="h-3 w-full rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
