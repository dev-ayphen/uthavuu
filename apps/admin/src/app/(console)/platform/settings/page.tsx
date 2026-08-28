import { Hammer } from "lucide-react";
import { EmptyState } from "@/components/ui";

export const metadata = { title: "App Settings" };

export default function Page() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight text-fg">App Settings</h2>
        <p className="mt-0.5 text-fg-subtle">Global switches that change how the mobile app behaves.</p>
      </div>
      <EmptyState
        icon={<Hammer className="size-10" />}
        title="Not built yet"
        description="App settings land with the platform module."
      />
      <div className="space-y-2">
        {Array.from({ length: 24 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-card border border-border bg-surface px-4 py-3"
          >
            <span className="text-xs font-semibold text-fg">Setting row {i + 1}</span>
            <span className="text-[11px] text-fg-faint">
              Placeholder — proves the sub-menu holds still while this pane scrolls
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
