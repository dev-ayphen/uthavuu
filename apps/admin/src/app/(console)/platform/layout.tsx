import { SubMenuPageLayout } from "@/components/layout";

/**
 * Platform is the settings archetype, so it uses SubMenuPageLayout — Mode B
 * scroll: the sub-menu holds still while only the content pane moves.
 *
 * The sub-nav lives in the LAYOUT rather than in each page so it persists
 * across navigation instead of remounting (and losing its scroll position)
 * every time an operator switches sub-section.
 */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <SubMenuPageLayout
      title="Platform"
      subtitle="Configuration and health"
      items={[
        { label: "Categories", href: "/platform/categories" },
        { label: "App Settings", href: "/platform/settings" },
        { label: "Support", href: "/platform/support" },
        { label: "System Health", href: "/platform/system-health" },
        { label: "Audit Logs", href: "/platform/audit-logs" },
      ]}
    >
      {children}
    </SubMenuPageLayout>
  );
}
