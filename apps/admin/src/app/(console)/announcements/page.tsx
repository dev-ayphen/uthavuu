import { SectionPlaceholder } from "@/components/layout";

export const metadata = { title: "Community Updates" };

export default function Page() {
  return (
    <SectionPlaceholder
      title="Community Updates"
      eyebrow="Community"
      subtitle="Field updates volunteers post while a mission is running."
      breadcrumb={[{ label: "Console", href: "/dashboard" }, { label: "Community" }, { label: "Updates" }]}
      summary="Update moderation lands with the community module."
    />
  );
}
