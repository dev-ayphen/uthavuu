import { Hammer } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/ui";
import { PageLayout, type Crumb } from "./page-layout";

/**
 * A section that exists in the navigation but has no feature behind it yet.
 *
 * It is deliberately explicit about being unbuilt rather than rendering an
 * empty table — an operator should never have to guess whether they are
 * looking at "no data" or "no feature".
 */
export function SectionPlaceholder({
  title,
  eyebrow,
  subtitle,
  breadcrumb,
  summary,
  actions,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  breadcrumb?: Crumb[];
  summary: string;
  actions?: ReactNode;
}) {
  return (
    <PageLayout
      title={title}
      eyebrow={eyebrow}
      subtitle={subtitle}
      breadcrumb={breadcrumb}
      actions={actions}
    >
      <EmptyState
        icon={<Hammer className="size-10" />}
        title="Not built yet"
        description={summary}
      />
    </PageLayout>
  );
}
