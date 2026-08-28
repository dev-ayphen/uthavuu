import { SectionPlaceholder } from "@/components/layout";

export const metadata = { title: "Impact Stories" };

export default function Page() {
  return (
    <SectionPlaceholder
      title="Impact Stories"
      eyebrow="Community"
      subtitle="Completed missions published as public impact stories."
      breadcrumb={[{ label: "Console", href: "/dashboard" }, { label: "Community" }, { label: "Impact Stories" }]}
      summary="Impact story review and publishing lands with the community module."
    />
  );
}
