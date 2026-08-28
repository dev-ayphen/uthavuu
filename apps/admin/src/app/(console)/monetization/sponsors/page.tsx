import { SectionPlaceholder } from "@/components/layout";

export const metadata = { title: "Sponsors" };

export default function Page() {
  return (
    <SectionPlaceholder
      title="Sponsors"
      eyebrow="Revenue"
      subtitle="Sponsor accounts, placements and campaign windows."
      breadcrumb={[{ label: "Console", href: "/dashboard" }, { label: "Monetization", href: "/monetization" }, { label: "Sponsors" }]}
      summary="Sponsor management lands with the sponsors module."
    />
  );
}
