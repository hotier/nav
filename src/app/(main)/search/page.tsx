import { Suspense } from "react";
import SearchContent from "./SearchContent";

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchSkeleton />}>
      <SearchContent />
    </Suspense>
  );
}

function SearchSkeleton() {
  return (
    <>
      <div className="mb-6">
        <div className="h-8 w-32 rounded bg-muted animate-pulse" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 animate-pulse">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-24 rounded bg-muted" />
                <div className="h-3 w-32 rounded bg-muted" />
              </div>
            </div>
            <div className="h-3 w-3/4 rounded bg-muted" />
          </div>
        ))}
      </div>
    </>
  );
}
