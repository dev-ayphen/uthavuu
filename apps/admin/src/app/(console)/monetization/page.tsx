import { SectionPlaceholder } from "@/components/layout";

export const metadata = { title: "Monetization Overview" };

export default function Page() {
  return (
    <SectionPlaceholder
      title="Monetization Overview"
      eyebrow="Revenue"
      subtitle="Sponsor placements and ad performance. Uthavu never charges users."
      breadcrumb={[{ label: "Console", href: "/dashboard" }, { label: "Monetization" }]}
      summary="Monetization reporting lands with the sponsors module."
    />
  );
}
