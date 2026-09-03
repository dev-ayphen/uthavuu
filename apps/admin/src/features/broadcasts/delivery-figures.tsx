import { AlertTriangle } from "lucide-react";

import type { AdminBroadcast } from "./types";

/**
 * `recipient_count` and `delivered_count`, rendered as the two DIFFERENT
 * MEASUREMENTS they are.
 *
 * ─── THE RULE THIS FILE EXISTS TO ENFORCE ──────────────────────────────────
 *
 * The schema states it in capitals and it is worth repeating where the pixels
 * are chosen: DO NOT render these as "50,000 sent, 12,000 delivered" as if the
 * second were a subset of the first. They measure different things in different
 * units.
 *
 *   recipientCount  = `alerts` rows written. IN-APP REACH, counted in PEOPLE.
 *                     Committed before any push is attempted, so this is what
 *                     the broadcast actually achieved. It is the durable number.
 *
 *   deliveredCount  = FCM sends the provider ACCEPTED. PUSH, counted in DEVICE
 *                     SENDS, best-effort telemetry. Routinely LOWER (most users
 *                     have no registered device) and able to be HIGHER (one
 *                     person with a phone and a tablet counts twice). It can be
 *                     0 while recipientCount is 50,000 — that means FCM was
 *                     unreachable, NOT that nobody was notified.
 *
 * A progress bar, a percentage, or an "of" between them would report a
 * successful broadcast as a failed one, and would send an operator chasing a
 * delivery problem that does not exist. So: two figures, two units, two
 * labels, never one ratio.
 *
 * Both are null until a send runs, because "not sent yet" and "sent to nobody"
 * are different facts and 0 has to be free to mean the second one.
 */

const NUMBER = new Intl.NumberFormat("en-IN");

function plural(count: number, one: string, many: string): string {
  return `${NUMBER.format(count)} ${count === 1 ? one : many}`;
}

/** The compact form, for a table cell. */
export function DeliveryCell({ record }: { record: AdminBroadcast }) {
  if (record.recipientCount === null) {
    return <span className="text-fg-faint select-none">Not sent</span>;
  }

  return (
    <span>
      <span className="tabular block whitespace-nowrap text-fg">
        {plural(record.recipientCount, "person reached", "people reached")}
      </span>
      <span className="tabular block whitespace-nowrap text-[11px] text-fg-faint">
        {record.deliveredCount === null
          ? "Push not recorded"
          : `${NUMBER.format(record.deliveredCount)} push sends accepted`}
      </span>
    </span>
  );
}

/**
 * The full form, for the detail page, where there is room to say what the two
 * numbers mean instead of hoping the labels carry it.
 */
export function DeliveryPanel({ record }: { record: AdminBroadcast }) {
  if (record.recipientCount === null) {
    return (
      <p className="text-fg-subtle">
        Nothing has gone out yet, so there is nothing to count. The figures appear once this
        broadcast is sent.
      </p>
    );
  }

  const reached = record.recipientCount;
  const pushed = record.deliveredCount ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Figure
          value={NUMBER.format(reached)}
          unit={reached === 1 ? "person" : "people"}
          label="Reached in the app"
          note="Alert rows written, one per person. Committed before any push was attempted, so this is what the broadcast actually achieved."
        />
        <Figure
          value={NUMBER.format(pushed)}
          unit={pushed === 1 ? "device send" : "device sends"}
          label="Push accepted by FCM"
          note="Counted in device sends, not people — someone with a phone and a tablet counts twice, and someone with no registered device counts none. Best-effort: FCM accepting a message is not a handset displaying it."
        />
      </div>

      {/* The two readings that would otherwise be misread, named explicitly. */}
      {reached === 0 ? (
        <Note tone="warning">
          <strong className="font-bold">This broadcast reached nobody.</strong>{" "}
          {record.audience.key === "district" && record.district ? (
            <>
              No account has its district set to exactly “{record.district}”. District is matched
              as free text against what each citizen&apos;s app reported, so a spelling that
              differs by one character selects no one.
            </>
          ) : (
            <>No account was eligible to receive it. Suspended accounts are excluded.</>
          )}
        </Note>
      ) : record.deliveredCount === 0 ? (
        <Note tone="info">
          No push notification was accepted, but{" "}
          <strong className="font-bold">the alert still landed for {plural(reached, "person", "people")}</strong>{" "}
          and is waiting in their alert list. This is the normal reading when nobody has a
          registered device, and it is also what an unreachable FCM looks like — the two are not
          distinguishable from here.
        </Note>
      ) : null}
    </div>
  );
}

function Figure({
  value,
  unit,
  label,
  note,
}: {
  value: string;
  unit: string;
  label: string;
  note: string;
}) {
  return (
    <div className="rounded-control border border-border bg-surface-2 px-3.5 py-3">
      <p className="micro-label text-fg-muted">{label}</p>
      <p className="tabular mt-1 text-fg">
        <span className="text-lg font-bold">{value}</span>{" "}
        <span className="text-xs text-fg-subtle">{unit}</span>
      </p>
      <p className="mt-1.5 text-xs text-fg-faint">{note}</p>
    </div>
  );
}

function Note({ tone, children }: { tone: "warning" | "info"; children: React.ReactNode }) {
  return (
    <p
      className={
        tone === "warning"
          ? "flex items-start gap-2 rounded-control border border-warning-soft-border bg-warning-soft px-3 py-2 text-xs text-warning-fg"
          : "flex items-start gap-2 rounded-control border border-info-soft-border bg-info-soft px-3 py-2 text-xs text-info-fg"
      }
    >
      <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
