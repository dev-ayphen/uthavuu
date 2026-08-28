import { Skeleton } from "@/components/ui";

/** Mirrors the loaded shape: heading, count chips, then the nine-row table. */
export default function Loading() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="h-6 w-36" />
        <Skeleton className="mt-2 h-4 w-[30rem] max-w-full" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-5 w-24 rounded-pill" />
        <Skeleton className="h-5 w-32 rounded-pill" />
        <Skeleton className="h-5 w-24 rounded-pill" />
      </div>
      <Skeleton className="h-[28rem] rounded-card" />
    </div>
  );
}
