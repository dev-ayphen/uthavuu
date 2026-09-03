/**
 * Shapes returned by `/admin/broadcasts`.
 *
 * Transcribed from `AdminBroadcastsService.toResponse()` in
 * `apps/api/src/admin/admin-broadcasts.service.ts` and verified field-for-field
 * against the running API, not guessed:
 *
 *   GET    /admin/broadcasts?page&limit&status&q   -> { items, pagination }
 *   GET    /admin/broadcasts/:id
 *   POST   /admin/broadcasts
 *   PATCH  /admin/broadcasts/:id
 *   POST   /admin/broadcasts/:id/send              -> IRREVERSIBLE fan-out
 *   POST   /admin/broadcasts/:id/cancel
 *   DELETE /admin/broadcasts/:id?reason=…          -> 204 (SOFT delete, draft only)
 *
 * `AdminBroadcastsController` declares `platform:manage` at CLASS level, so
 * every route above is behind the one permission. Read and write share it, so
 * there is no "can look but not touch" state to render — the page is gated
 * whole, server-side, in `permission.ts`.
 *
 * ─── A BROADCAST IS NOT AN ANNOUNCEMENT ────────────────────────────────────
 *
 * They look identical on a form — both are bilingual staff-authored copy — and
 * they are opposite in the one way that matters (ADR 0013, and the header
 * comment on `db/schema/broadcasts-schema.ts`):
 *
 *   Announcement -> PULLED. One row, no recipient. A citizen who opens the app
 *                   reads it. Nobody is notified. Publishing is reversible.
 *   Broadcast    -> PUSHED. One `alerts` row PER RECIPIENT plus an FCM
 *                   notification. It arrives whether or not the app is open,
 *                   and there is no un-send.
 *
 * That is why this record carries `audience` / `recipientCount` /
 * `deliveredCount` / `sentAt` where an announcement carries a publish window.
 * Everything in this feature that looks like over-caution next to
 * `features/announcements` is that difference.
 */

/** The five seeded status keys. Others still render, via the API's own label. */
export type BroadcastStatusKey = "draft" | "scheduled" | "sending" | "sent" | "cancelled";

/**
 * The two audiences the fan-out actually implements.
 *
 * A CLOSED union, unlike `BroadcastStatusRef["key"]` below, and the asymmetry
 * is the API's own (see `BROADCAST_AUDIENCE_KEYS` in the schema file). A status
 * FILTERS rows, so an unknown value is harmless. An audience SELECTS
 * RECIPIENTS — one this build does not know has no recipient query behind it,
 * and offering it in a dropdown would produce a broadcast that fans out to
 * nobody while reporting success.
 */
export type BroadcastAudienceKey = "all_users" | "district";

/**
 * `{ key, label }` with a `string` key, matching `CommunityUpdateStatus` and
 * `AdminRoleRef`: the API owns the lookup table and authors the display text,
 * so a status seeded server-side renders with its real name instead of making
 * the row look broken until this console is redeployed.
 */
export type BroadcastStatusRef = { key: string; label: string };
export type BroadcastAudienceRef = { key: string; label: string };

export type AdminBroadcast = {
  id: string;
  /** Required by the API. What every citizen falls back to. */
  titleEn: string;
  bodyEn: string;
  /** Optional. `null` means "a Tamil reader sees the English" — per field. */
  titleTa: string | null;
  bodyTa: string | null;
  status: BroadcastStatusRef;
  audience: BroadcastAudienceRef;
  /** Set if and only if `audience.key === "district"`. Free text — see below. */
  district: string | null;
  /** When an admin asked for this to go out. NOTHING SWEEPS IT — see `schema.ts`. */
  scheduledAt: string | null;
  /** Stamped when the fan-out COMPLETED. Null while a send is still in `sending`. */
  sentAt: string | null;
  /**
   * TWO DIFFERENT MEASUREMENTS. Never render them as "X of Y" — see
   * `delivery-figures.tsx`, which is the only component allowed to show them.
   *
   * `recipientCount`  people who got an in-app alert row (durable, committed).
   * `deliveredCount`  FCM sends the provider accepted (device-level, best-effort).
   *
   * Both null until a send runs, because "not sent yet" and "sent to nobody"
   * are different facts and 0 has to be free to mean the second one.
   */
  recipientCount: number | null;
  deliveredCount: number | null;
  createdBy: { id: string; name: string } | null;
  /**
   * The sender's admin account was deleted; the record of what was broadcast
   * survives (`ON DELETE SET NULL`, never CASCADE). Distinct from
   * `createdBy === null` meaning "never had one", and the two read very
   * differently to an operator.
   */
  createdByDeleted: boolean;
  createdAt: string;
  updatedAt: string;
};

/** The body `POST /admin/broadcasts` and `PATCH …/:id` accept. */
export type BroadcastPayload = {
  titleEn: string;
  bodyEn: string;
  titleTa: string | null;
  bodyTa: string | null;
  audience: BroadcastAudienceKey;
  district: string | null;
  scheduledAt: string | null;
};

/**
 * ─── WHICH ACTION EACH STATUS ALLOWS ───────────────────────────────────────
 *
 * `features/announcements` deliberately does NOT derive its buttons, because
 * its contract never wrote the preconditions down and inventing them would
 * hide a legal action behind a console-invented rule. Here the opposite is
 * true: `AdminBroadcastsService` states every precondition explicitly, with a
 * distinct error code per refusal (`assertMutable`, `assertSendable`,
 * `cancel()`, `delete()`), so these four predicates are TRANSCRIBED rather than
 * guessed and the console can offer only what the API will accept.
 *
 * They are a UX mirror, not a gate. The API is still authoritative, every
 * refusal still surfaces next to the button that caused it, and the row can
 * always be stale by the time a click lands — which is what the stale-conflict
 * refetch in `broadcast-errors.ts` is for.
 */

/** `draft` and `scheduled` — the statuses that have notified nobody yet. */
export function isBroadcastEditable(record: AdminBroadcast): boolean {
  return record.status.key === "draft" || record.status.key === "scheduled";
}

/** Same set: a send claims `draft|scheduled -> sending` conditionally. */
export function canSendBroadcast(record: AdminBroadcast): boolean {
  return isBroadcastEditable(record);
}

/** Scheduled only. Nothing to cancel on a draft; nothing cancellable once sent. */
export function canCancelBroadcast(record: AdminBroadcast): boolean {
  return record.status.key === "scheduled";
}

/** Draft only. A scheduled broadcast must be cancelled first, on purpose. */
export function canDeleteBroadcast(record: AdminBroadcast): boolean {
  return record.status.key === "draft";
}

/** True once a broadcast has notified people, or is in the middle of doing so. */
export function hasBroadcastFannedOut(record: AdminBroadcast): boolean {
  return record.status.key === "sent" || record.status.key === "sending";
}
