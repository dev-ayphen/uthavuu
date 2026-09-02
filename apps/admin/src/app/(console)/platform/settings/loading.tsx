import { Skeleton } from "@/components/ui";
import { SettingsSkeleton } from "@/features/platform-settings/settings-skeleton";

/**
 * Mirrors the loaded shape: the heading pair, then the same skeleton the
 * query's own pending state uses — so the segment boundary and the data
 * boundary cannot drift apart, and nothing jumps when either resolves.
 */
export default function Loading() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-2 h-4 w-[34rem] max-w-full" />
      </div>
      <SettingsSkeleton />
    </div>
  );
}
