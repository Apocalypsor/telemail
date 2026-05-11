import { Skeleton } from "@heroui/react";

export const MailListSkeleton = () => {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3"
        >
          <Skeleton className="h-4 w-1/3 rounded-md" />
          <Skeleton className="h-3 w-full rounded-md" />
          <Skeleton className="h-3 w-5/6 rounded-md" />
        </div>
      ))}
    </div>
  );
};
