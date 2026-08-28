import { Skeleton } from "@/components/ui";

/** Mirrors the loaded shape: heading, filter row, table. */
export default function Loading() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="h-6 w-28" />
        <Skeleton className="mt-2 h-4 w-[28rem] max-w-full" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-44" />
      </div>
      <Skeleton className="h-[26rem] rounded-card" />
    </div>
  );
}
