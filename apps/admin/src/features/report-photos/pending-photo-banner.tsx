import Link from "next/link";
import { ImageOff } from "lucide-react";

import { CalloutCard } from "@/components/ui";
import { photoVerificationHref } from "@/features/moderation/routes";

/**
 * What a report detail page says when the report is held by photo verification.
 *
 * ==========================================================================
 * THE ABSENT PHOTO IS THE POINT, NOT A BUG.
 * ==========================================================================
 * A report in `pending_review` has ZERO `report_photos` rows, so
 * `GET /admin/reports/:id` returns an empty `photos` array and the detail page
 * renders no photo section at all. Left unexplained, that reads as data loss —
 * a moderator sees a report whose photo has "gone missing" and starts looking
 * for the fault. There isn't one: the relationship is created by the backend,
 * after approval, in a transaction.
 *
 * So this banner exists to say the true thing out loud. It deliberately does
 * NOT render a placeholder tile where a photo would be, and it must never be
 * changed to fetch the quarantined image onto this page: on a report detail
 * screen an image frame implies the photograph is attached, which is exactly
 * the state that does not hold.
 *
 * WHY THE LINK GOES TO THE QUEUE AND NOT TO THE ITEM
 * ───────────────────────────────────────────────────────────────────────────
 * `GET /admin/reports/:id` carries no `photo_uploads` id, and
 * `GET /admin/report-photos` takes no `reportId` filter — so there is nothing
 * to build a deep link from. Sending the operator to the queue is honest;
 * fabricating an id, or filtering on a parameter the endpoint would silently
 * strip, would produce a link that lands somewhere and claims to be scoped.
 */
export function PendingPhotoBanner() {
  return (
    <CalloutCard tone="warning" icon={ImageOff} title="Photo verification required">
      This report is held until a moderator decides about its photograph. Nobody outside the
      console can see it, and it carries no photo record at all until the photo is approved — the
      empty Photos section below is that rule working, not a missing file.{" "}
      <Link
        href={photoVerificationHref()}
        className="rounded-control font-semibold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        Open the photo verification queue
      </Link>
      .
    </CalloutCard>
  );
}
