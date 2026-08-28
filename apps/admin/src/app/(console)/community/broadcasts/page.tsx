import { SectionPlaceholder } from "@/components/layout";

export const metadata = { title: "Broadcasts" };

export default function Page() {
  return (
    <SectionPlaceholder
      title="Broadcasts"
      eyebrow="Community"
      subtitle="Push announcements sent to a district or to everyone."
      breadcrumb={[{ label: "Console", href: "/dashboard" }, { label: "Community" }, { label: "Broadcasts" }]}
      summary="Broadcast composition and delivery reporting land with the notifications module."
    />
  );
}
