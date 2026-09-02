import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge, Card, CardBody, CardHeader, CardTitle } from "@/components/ui";

/**
 * A figure this system cannot produce, rendered as the reason instead.
 *
 * WHY THIS IS A COMPONENT AND NOT A `0`
 * ───────────────────────────────────────────────────────────────────────────
 * It is the card-sized version of the rule the dashboard states for a single
 * number (`features/dashboard/use-dashboard-summary.ts`): a `0` on "Fake
 * reports" reads as "nothing to review", when the truth is "we do not track
 * this yet" — and an operator ACTS on the first and INVESTIGATES the second.
 *
 * Revenue is the sharpest case of that in the whole console. "₹0 this month" is
 * a business emergency; "nothing is measuring this" is an engineering task.
 * They go to different people. A monetization screen that renders the second as
 * the first has not merely shown a wrong number, it has sent the wrong person
 * looking for a problem that does not exist.
 *
 * `tone` is `neutral`, never `danger`. Nothing here is broken — a thing that was
 * never connected is not a thing that failed, and red would say otherwise.
 */
export function NotAvailableCard({
  icon: Icon,
  title,
  status,
  children,
  footer,
  className,
}: {
  icon: LucideIcon;
  title: string;
  /** Two or three words on the state itself: "Not connected", "Not configured". */
  status: string;
  /** Why there is no figure. State the mechanism, not an apology. */
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>
          <Icon className="size-4 text-fg-faint" aria-hidden />
          {title}
        </CardTitle>
        <Badge tone="neutral">{status}</Badge>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="space-y-2 text-fg-subtle">{children}</div>
        {footer ? <div className="flex flex-wrap items-center gap-2 pt-1">{footer}</div> : null}
      </CardBody>
    </Card>
  );
}
