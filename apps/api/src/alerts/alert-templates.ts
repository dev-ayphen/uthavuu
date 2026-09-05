// Localized templates for backend-generated alert prose.
//
// Why this exists at all, given the mobile app has its own i18n catalog:
// there are two consumers of an alert's text and only one of them has a
// client. The in-app Alerts list renders from the mobile catalog (so it
// re-renders instantly when the user switches language, even for alerts
// written long before). A push notification has no client to ask — the
// server has to produce the final prose itself, at send time, from
// whatever locale it has on file. Both read from the same `type` + `params`
// pair, so the two surfaces can't drift apart.
//
// The English rendering is also stored on the alert row (alerts.title/body)
// as a fallback: it keeps a row self-describing when read straight out of
// the database or the admin console, and it is what a client that doesn't
// recognise a newly-added alert type falls back to.
//
// IMPORTANT: every Tamil string here is machine-generated, not
// human-translated — same caveat as libs-mobile/i18n/locales/ta/*.json.
// This is a public safety app for real Tamil Nadu users; these need a
// native-speaker review pass before production. Don't remove this note.

// Known type tags. Not DB-enforced (see alerts-schema.ts) — an event-log
// discriminator with no valid-transition rules to enforce.
export type AlertType =
  | 'volunteer_accepted'
  | 'volunteer_released'
  | 'mission_completed'
  | 'report_cancelled'
  // Photo review. These three are the only alerts in this file raised by a
  // MODERATOR rather than by another citizen's action, and they are the only
  // channel by which a reporter learns why a request they submitted did not
  // appear. Without them a held report is silent failure: the reporter sees it
  // sitting in their own list, nobody else ever sees it, and nothing says why.
  //
  // ⚠️ NONE OF THIS COPY MAY DESCRIBE THE MACHINE'S REASONING. No confidence
  // score, no label name, no threshold, and not the moderator's own written
  // reason either — that sentence is internal, English-only, and written for
  // the audit log rather than for the person it is about. A citizen who learns
  // which signal held their photo has learned how to tune the next one until it
  // passes, which is the same rule photo-verification.service.ts applies to the
  // upload response.
  | 'report_photo_approved'
  | 'report_photo_rejected'
  | 'report_photo_replacement_requested';

export const ALERT_LOCALES = ['en', 'ta'] as const;
export type AlertLocale = (typeof ALERT_LOCALES)[number];
export const DEFAULT_ALERT_LOCALE: AlertLocale = 'en';

// The structured payload stored alongside the alert, and the only thing a
// template is allowed to interpolate. `volunteerName` is null when the
// volunteer record has no name yet — deliberately null rather than a baked-in
// "A volunteer", so each locale supplies its own fallback wording instead of
// inheriting English.
export type AlertParams = {
  volunteerName: string | null;
  reportTitle: string;
};

export type RenderedAlert = { title: string; body: string };

type Template = {
  title: string;
  body: (params: AlertParams, anonymousVolunteer: string) => string;
};

const TEMPLATES: Record<
  AlertLocale,
  { anonymousVolunteer: string } & Record<AlertType, Template>
> = {
  en: {
    anonymousVolunteer: 'A volunteer',
    volunteer_accepted: {
      title: 'Volunteer Accepted',
      body: (p, who) =>
        `${p.volunteerName ?? who} is heading to help with "${p.reportTitle}".`,
    },
    volunteer_released: {
      title: 'Volunteer Update',
      body: (p, who) =>
        `${p.volunteerName ?? who} is no longer available to help with "${p.reportTitle}".`,
    },
    mission_completed: {
      title: 'Mission Completed',
      body: (p, who) =>
        `${p.volunteerName ?? who} marked "${p.reportTitle}" as complete.`,
    },
    // Sent to a volunteer, not the reporter — volunteerName doesn't apply
    // here (there's no third party to name), so the body only uses reportTitle.
    report_cancelled: {
      title: 'Request Cancelled',
      body: (p) =>
        `The request you joined ("${p.reportTitle}") has been cancelled by the reporter.`,
    },
    // Sent when the review RELEASES the report, not when one photo is approved
    // — see AdminReportPhotosService.approve(). "Your photo passed" would be a
    // fact the reporter cannot act on and, on a multi-photo report, would be
    // sent while the request was still invisible to everyone.
    report_photo_approved: {
      title: 'Request Published',
      body: (p) =>
        `Your request ("${p.reportTitle}") has been reviewed and is now visible to nearby volunteers.`,
    },
    // Deliberately says the request was not published rather than naming what
    // was wrong with the picture. It is also the one alert of the three raised
    // WITHOUT a reportId (see AdminReportPhotosService.reject) — the wording
    // therefore has to stand on its own, because it is not a link to anything.
    report_photo_rejected: {
      title: 'Request Not Published',
      body: (p) =>
        `Your request ("${p.reportTitle}") could not be published because a photo on it does not meet Uthavu's photo guidelines.`,
    },
    report_photo_replacement_requested: {
      title: 'New Photo Needed',
      body: (p) =>
        `Your request ("${p.reportTitle}") needs a different photo before it can be published. Please add another one.`,
    },
  },
  ta: {
    anonymousVolunteer: 'ஒரு தன்னார்வலர்',
    volunteer_accepted: {
      title: 'தன்னார்வலர் ஏற்றுக்கொண்டார்',
      body: (p, who) =>
        `"${p.reportTitle}" என்பதற்கு உதவ ${p.volunteerName ?? who} வருகிறார்.`,
    },
    volunteer_released: {
      title: 'தன்னார்வலர் புதுப்பிப்பு',
      body: (p, who) =>
        `"${p.reportTitle}" என்பதற்கு உதவ ${p.volunteerName ?? who} இனி கிடைக்கவில்லை.`,
    },
    mission_completed: {
      title: 'பணி நிறைவடைந்தது',
      body: (p, who) =>
        `${p.volunteerName ?? who} "${p.reportTitle}" ஐ நிறைவு செய்துள்ளார்.`,
    },
    report_cancelled: {
      title: 'கோரிக்கை ரத்து செய்யப்பட்டது',
      body: (p) =>
        `நீங்கள் இணைந்த கோரிக்கை ("${p.reportTitle}") புகாரளித்தவரால் ரத்து செய்யப்பட்டது.`,
    },
    // ⚠️ MACHINE-TRANSLATED, NOT REVIEWED. The file-level caveat above applies
    // to every Tamil string here, and it applies hardest to these three: they
    // are the copy that tells a person in an emergency why their request for
    // help did not appear. A native-speaker pass is required before production
    // — do not treat these as final.
    report_photo_approved: {
      title: 'கோரிக்கை வெளியிடப்பட்டது',
      body: (p) =>
        `உங்கள் கோரிக்கை ("${p.reportTitle}") சரிபார்க்கப்பட்டு, இப்போது அருகிலுள்ள தன்னார்வலர்களுக்குத் தெரிகிறது.`,
    },
    report_photo_rejected: {
      title: 'கோரிக்கை வெளியிடப்படவில்லை',
      body: (p) =>
        `உங்கள் கோரிக்கையில் ("${p.reportTitle}") உள்ள ஒரு புகைப்படம் உதவு-வின் புகைப்பட வழிகாட்டுதல்களுக்கு உட்படாததால், அது வெளியிடப்படவில்லை.`,
    },
    report_photo_replacement_requested: {
      title: 'புதிய புகைப்படம் தேவை',
      body: (p) =>
        `உங்கள் கோரிக்கை ("${p.reportTitle}") வெளியிடப்படுவதற்கு முன், வேறு ஒரு புகைப்படம் தேவை. தயவுசெய்து மற்றொன்றைச் சேர்க்கவும்.`,
    },
  },
};

export function isAlertLocale(value: unknown): value is AlertLocale {
  return (
    typeof value === 'string' &&
    (ALERT_LOCALES as readonly string[]).includes(value)
  );
}

// Falls back to English for an unrecognised locale rather than throwing: an
// alert that renders in the wrong language is a bad experience, but an alert
// that fails to send because a stale locale string reached the renderer is a
// worse one.
export function renderAlert(
  type: AlertType,
  params: AlertParams,
  locale: AlertLocale = DEFAULT_ALERT_LOCALE,
): RenderedAlert {
  const catalog = TEMPLATES[locale] ?? TEMPLATES[DEFAULT_ALERT_LOCALE];
  const template = catalog[type];
  return {
    title: template.title,
    body: template.body(params, catalog.anonymousVolunteer),
  };
}

// ─── BROADCASTS ─────────────────────────────────────────────────────────────
//
// Everything above renders GENERATED prose: a fixed template per (type, locale)
// with `params` interpolated in. A broadcast is the opposite — the prose is
// typed by a member of staff in the admin console, so there is no template to
// look up and nothing to interpolate. What has to happen at render time is a
// per-field CHOICE between two stored columns.
//
// WHY 'broadcast' IS NOT A MEMBER OF `AlertType`. `AlertType` is the set of tags
// `renderAlert()` can render, and `TEMPLATES` is exhaustive over it — that
// exhaustiveness is what makes adding a type without adding its Tamil copy a
// compile error, which is worth more than having one union that lists every
// string the `alerts.type` column can hold. `alerts.type` is plain text with no
// FK (alerts-schema.ts) precisely because it is an event-log discriminator, so
// a tag that no template covers is a legitimate value, not a hole. Keeping the
// two apart also means AlertsService.create() — the templated path, on which
// five existing call sites depend — needs no change at all.
export const BROADCAST_ALERT_TYPE = 'broadcast';

/** The stored bilingual copy a broadcast renders from. */
export type BroadcastAlertCopy = {
  titleEn: string;
  bodyEn: string;
  titleTa: string | null;
  bodyTa: string | null;
};

/**
 * Picks the copy one recipient sees, PER FIELD.
 *
 * Per-field rather than per-row: a half-translated broadcast (Tamil headline
 * over an English body, or the reverse) renders each field in the best language
 * it actually has, instead of discarding a real translation because its sibling
 * column is empty. Only `ta` has anything to fall back from; every other locale
 * resolves to English, which is the column that is NOT NULL.
 *
 * Never throws, for the reason `renderAlert` gives: a notice shown in the wrong
 * language is a bad experience, a notice that fails to send because a stale
 * locale string reached the renderer is a worse one — and this is an emergency
 * product, so the failure mode of "did not send" is the expensive one.
 *
 * NOTE ON WHY THIS DUPLICATES updates/update-locale.ts's `pickCopy`. That helper
 * answers the same question for announcements and is deliberately not imported
 * here (nor this one there): its locale union belongs to a citizen READ path
 * that resolves on every request, this one belongs to push rendering that
 * resolves ONCE, at fan-out, and is then frozen into an `alerts` row. Tying them
 * together would couple a notification's permanent stored text to a read-time
 * display concern. What must not drift is the SET of locales, and that is pinned
 * by `user.locale`'s own contract, not by either helper.
 */
export function renderBroadcastAlert(
  copy: BroadcastAlertCopy,
  locale: AlertLocale = DEFAULT_ALERT_LOCALE,
): RenderedAlert {
  const tamil = locale === 'ta';
  return {
    title: tamil && copy.titleTa !== null ? copy.titleTa : copy.titleEn,
    body: tamil && copy.bodyTa !== null ? copy.bodyTa : copy.bodyEn,
  };
}
