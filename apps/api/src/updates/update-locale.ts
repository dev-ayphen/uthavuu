// Locale resolution for community updates.
//
// The shape is lifted deliberately from alerts/alert-templates.ts — a closed
// locale union, an English default, and a resolver that falls back rather than
// throws — but the constants are NOT imported from it, and that is a decision
// rather than duplication for its own sake. Those names (`ALERT_LOCALES`,
// `isAlertLocale`) belong to push-notification rendering; importing them here
// would tie a community-announcement read path to the alerts module's future,
// and the two answer different questions. What must not drift is the *set* of
// locales, and that is pinned by `user.locale`'s own contract
// (db/schema/auth-schema.ts: 'en' | 'ta', validated on write by
// users/dto/update-locale.dto.ts).
//
// The difference from alerts is worth stating: an alert's prose is generated
// from a template, so any locale the code ships can be rendered. An
// announcement's prose is typed by a human, so a locale only renders if someone
// wrote it — which is why resolution here is a per-field fallback over stored
// columns rather than a template lookup.
export const UPDATE_LOCALES = ['en', 'ta'] as const;
export type UpdateLocale = (typeof UPDATE_LOCALES)[number];
export const DEFAULT_UPDATE_LOCALE: UpdateLocale = 'en';

/**
 * A user's stored locale, narrowed.
 *
 * Falls back to English for null, undefined, or anything unrecognised, and
 * never throws — same reasoning as `renderAlert`: an announcement shown in the
 * wrong language is a bad experience, an announcement that fails to load
 * because a stale locale string reached the resolver is a worse one. `locale`
 * is nullable on `user` and stays null until the client reports one.
 */
export function resolveUpdateLocale(value: unknown): UpdateLocale {
  return typeof value === 'string' &&
    (UPDATE_LOCALES as readonly string[]).includes(value)
    ? (value as UpdateLocale)
    : DEFAULT_UPDATE_LOCALE;
}

/**
 * Pick the copy a reader sees.
 *
 * Per-field, not per-row: a half-translated announcement (Tamil headline,
 * English body — or the reverse) renders each field in the best language it
 * actually has, instead of discarding a real translation because its sibling
 * column is empty. Only `ta` has anything to fall back from; every other
 * locale resolves to English, which is the column that is NOT NULL.
 */
export function pickCopy(
  locale: UpdateLocale,
  english: string,
  tamil: string | null,
): string {
  return locale === 'ta' && tamil !== null ? tamil : english;
}
