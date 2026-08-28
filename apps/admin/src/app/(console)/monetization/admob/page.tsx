import { SectionPlaceholder } from "@/components/layout";

export const metadata = { title: "Google AdMob" };

export default function Page() {
  return (
    <SectionPlaceholder
      title="Google AdMob"
      eyebrow="Revenue"
      subtitle="Ad unit configuration and fill reporting."
      breadcrumb={[{ label: "Console", href: "/dashboard" }, { label: "Monetization", href: "/monetization" }, { label: "AdMob" }]}
      summary="AdMob reporting lands with the sponsors module."
    />
  );
}
