import { SystemHealthView } from "@/features/system-health/system-health-view";

export const metadata = { title: "System Health" };

/** Frame comes from `platform/layout.tsx` (SubMenuPageLayout, Mode B scroll). */
export default function Page() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight text-fg">System Health</h2>
        <p className="mt-0.5 text-fg-subtle">
          What the API can see about itself right now — database, Redis, uptime and which
          credentials are configured. Re-checked every 30 seconds while this tab is open.
        </p>
      </div>

      <SystemHealthView />
    </div>
  );
}
