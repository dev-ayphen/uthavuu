import { AccessDeniedState } from "@/components/ui";
import { ACCESS_DENIED } from "@/lib/access-denied-copy";
import { canManageAppSettings } from "@/features/platform-settings/permission";
import { SettingsView } from "@/features/platform-settings/settings-view";

export const metadata = { title: "App Settings" };

/**
 * Platform -> App Settings.
 *
 * Frame comes from `platform/layout.tsx` (SubMenuPageLayout, Mode B scroll):
 * the sub-menu holds still, this pane is the only thing that moves. So there is
 * no `PageLayout` here and — per the layout contract — no `max-w-*`, no
 * `mx-auto` and no page padding either. The layout owns all four.
 *
 * A server component only to resolve the permission. Everything below is
 * client-side, because every control on the page writes.
 *
 * WHAT THIS PAGE DELIBERATELY DOES NOT RENDER
 * ───────────────────────────────────────────────────────────────────────────
 * Anything the API does not return. The screen this replaces showed fourteen
 * toggles of which eleven had no handler and no state, their on/off position
 * decided by array index (`docs/webadmin/07-platform-settings.md` §2A), plus a
 * Save button that called `alert()` and persisted nothing. Every control here
 * is bound to a field in the frozen contract and reaches a real PATCH; there
 * are exactly eleven of them because the contract has exactly eleven fields.
 */
export default async function Page() {
  // Mirrors `platform:manage` for UX only — the API enforces it on both
  // routes. Read and write share the permission, so there is no "view but
  // don't touch" state: the page is gated whole.
  const canManage = await canManageAppSettings();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight text-fg">App Settings</h2>
        <p className="mt-0.5 text-fg-subtle">
          Global switches that change how the mobile app behaves for every citizen at once. There
          is no draft and no staging — a save takes effect wherever the app reads it.
        </p>
      </div>

      {canManage ? <SettingsView /> : <AccessDeniedState {...ACCESS_DENIED.settings} />}
    </div>
  );
}
