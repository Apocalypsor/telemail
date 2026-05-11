import { Skeleton } from "@heroui/react";
import { WebLayout } from "./web-layout";

export type AppPendingSkeletonSurface = "web" | "miniapp";

function AppPendingSkeletonContent() {
  return (
    <article className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <Skeleton className="h-9 w-2/3 rounded-md" />
      <Skeleton className="h-4 w-1/3 rounded-md" />
      <Skeleton className="h-4 w-1/2 rounded-md" />
      <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-3">
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-4 w-11/12 rounded-md" />
        <Skeleton className="h-4 w-10/12 rounded-md" />
        <Skeleton className="h-4 w-9/12 rounded-md" />
      </div>
    </article>
  );
}

export function AppPendingSkeleton({
  surface,
}: {
  surface?: AppPendingSkeletonSurface;
}) {
  const resolvedSurface =
    surface ??
    (window.location.pathname.startsWith("/telegram-app") ? "miniapp" : "web");

  if (resolvedSurface === "web") {
    return (
      <WebLayout>
        <AppPendingSkeletonContent />
      </WebLayout>
    );
  }

  return <AppPendingSkeletonContent />;
}
