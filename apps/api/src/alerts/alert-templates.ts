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
export type AlertType = 'volunteer_accepted' | 'volunteer_released' | 'mission_completed' | 'report_cancelled';

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

const TEMPLATES: Record<AlertLocale, { anonymousVolunteer: string } & Record<AlertType, Template>> = {
  en: {
    anonymousVolunteer: 'A volunteer',
    volunteer_accepted: {
      title: 'Volunteer Accepted',
      body: (p, who) => `${p.volunteerName ?? who} is heading to help with "${p.reportTitle}".`,
    },
    volunteer_released: {
      title: 'Volunteer Update',
      body: (p, who) => `${p.volunteerName ?? who} is no longer available to help with "${p.reportTitle}".`,
    },
    mission_completed: {
      title: 'Mission Completed',
      body: (p, who) => `${p.volunteerName ?? who} marked "${p.reportTitle}" as complete.`,
    },
    // Sent to a volunteer, not the reporter — volunteerName doesn't apply
    // here (there's no third party to name), so the body only uses reportTitle.
    report_cancelled: {
      title: 'Request Cancelled',
      body: (p) => `The request you joined ("${p.reportTitle}") has been cancelled by the reporter.`,
    },
  },
  ta: {
    anonymousVolunteer: 'ஒரு தன்னார்வலர்',
    volunteer_accepted: {
      title: 'தன்னார்வலர் ஏற்றுக்கொண்டார்',
      body: (p, who) => `"${p.reportTitle}" என்பதற்கு உதவ ${p.volunteerName ?? who} வருகிறார்.`,
    },
    volunteer_released: {
      title: 'தன்னார்வலர் புதுப்பிப்பு',
      body: (p, who) => `"${p.reportTitle}" என்பதற்கு உதவ ${p.volunteerName ?? who} இனி கிடைக்கவில்லை.`,
    },
    mission_completed: {
      title: 'பணி நிறைவடைந்தது',
      body: (p, who) => `${p.volunteerName ?? who} "${p.reportTitle}" ஐ நிறைவு செய்துள்ளார்.`,
    },
    report_cancelled: {
      title: 'கோரிக்கை ரத்து செய்யப்பட்டது',
      body: (p) => `நீங்கள் இணைந்த கோரிக்கை ("${p.reportTitle}") புகாரளித்தவரால் ரத்து செய்யப்பட்டது.`,
    },
  },
};

export function isAlertLocale(value: unknown): value is AlertLocale {
  return typeof value === 'string' && (ALERT_LOCALES as readonly string[]).includes(value);
}

// Falls back to English for an unrecognised locale rather than throwing: an
// alert that renders in the wrong language is a bad experience, but an alert
// that fails to send because a stale locale string reached the renderer is a
// worse one.
export function renderAlert(type: AlertType, params: AlertParams, locale: AlertLocale = DEFAULT_ALERT_LOCALE): RenderedAlert {
  const catalog = TEMPLATES[locale] ?? TEMPLATES[DEFAULT_ALERT_LOCALE];
  const template = catalog[type];
  return { title: template.title, body: template.body(params, catalog.anonymousVolunteer) };
}
