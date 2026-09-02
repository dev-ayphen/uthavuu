"use client";

import { History, RotateCcw, ScrollText } from "lucide-react";
import Link from "next/link";

import { PersonCell, RelativeTime, formatDate } from "@/components/data";
import { Button } from "@/components/ui";
import type { AdminSettings } from "./types";

/**
 * Who last changed these settings, and when.
 *
 * WHY THIS IS ON THE PAGE AT ALL
 * ───────────────────────────────────────────────────────────────────────────
 * Everything on this screen is global and silent: nothing tells the person who
 * did not make the change that it happened. Two operators can be in this
 * console at once, and one of them may have just closed the app to every
 * citizen in Tamil Nadu. `updatedAt` / `updatedBy` are what turn "the switch
 * is on" into "Priya turned it on eleven minutes ago", which is the difference
 * between an operator investigating and an operator guessing.
 *
 * It reads from live query data, so it also serves as the passive signal that
 * someone else has saved while this page was open — and the Refresh button
 * beside it is the way to go and look. Refreshing NEVER touches the form: see
 * the `defaultValues` note in `settings-form.tsx`.
 *
 * THREE STATES, NOT TWO. The API derives them from one nullable column:
 *
 *   updatedBy set                    a named admin made the last change
 *   updatedBy null, deleted false    nobody has changed it since it was seeded
 *   updatedBy null, deleted true     an admin changed it and their account has
 *                                    since been removed (the FK is SET NULL)
 *
 * Collapsing the last two into "unknown" would tell an operator investigating a
 * live kill switch that nobody had touched it, when somebody had.
 *
 * This strip is a summary, not the record. The authoritative history — actor
 * name, email and role, snapshotted so it survives the account — is the
 * `platform_setting.update` audit row, which is why this links to Audit Logs
 * rather than trying to reconstruct a history from one timestamp.
 */
export function LastChanged({
  settings,
  onRefresh,
  refreshing,
}: {
  settings: AdminSettings;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const absolute = formatDate(settings.updatedAt, true);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-card border border-border bg-surface px-4 py-3 shadow-card">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-2 text-xs text-fg-subtle">
          <History aria-hidden className="size-3.5 shrink-0 text-fg-faint" />
          <span>
            Last changed{" "}
            {absolute ? (
              <>
                {/* Client-only, so it renders nothing until hydrated — the
                    absolute time beside it is what always shows. */}
                <RelativeTime value={settings.updatedAt} />{" "}
                <span className="tabular text-fg-muted">({absolute} IST)</span>
              </>
            ) : (
              // A malformed timestamp is stated, never quietly rendered as
              // "Invalid Date" or silently dropped.
              <span className="text-fg-faint">at an unreadable time</span>
            )}
          </span>
        </span>

        <span className="flex items-center gap-2 text-xs text-fg-subtle">
          <span className="text-fg-faint">by</span>
          {settings.updatedByDeleted ? (
            <PersonCell person={{ name: settings.updatedBy?.name ?? null, deleted: true }} />
          ) : settings.updatedBy ? (
            <PersonCell person={{ id: settings.updatedBy.id, name: settings.updatedBy.name }} />
          ) : (
            <span className="text-fg-faint">nobody — unchanged since it was seeded</span>
          )}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/platform/audit-logs">
            <ScrollText />
            Full history
          </Link>
        </Button>
        <Button variant="secondary" size="sm" onClick={onRefresh} disabled={refreshing}>
          <RotateCcw />
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
    </div>
  );
}
