import { Skeleton } from "@heroui/react";

export function AppPendingSkeleton() {
  const isMiniApp = window.location.pathname.startsWith("/telegram-app");

  if (isMiniApp) {
    return (
      <div className="max-w-xl mx-auto px-3 py-4 sm:p-6 space-y-5">
        <header className="space-y-2">
          <Skeleton className="h-8 w-36 rounded-md" />
          <Skeleton className="h-3 w-44 rounded-md" />
        </header>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3"
            >
              <Skeleton className="h-4 w-1/2 rounded-md" />
              <Skeleton className="h-3 w-full rounded-md" />
              <Skeleton className="h-3 w-4/5 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <Skeleton className="h-9 w-48 rounded-md" />
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 space-y-4">
        <Skeleton className="h-5 w-2/3 rounded-md" />
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-4 w-5/6 rounded-md" />
        <Skeleton className="h-4 w-3/4 rounded-md" />
      </div>
    </div>
  );
}
