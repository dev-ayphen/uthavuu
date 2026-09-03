// Mobile's only i18n surface (App Profile: English + Tamil, mobile-only —
// apps/admin stays english-only chrome). react-i18next, not next-intl
// (Next.js-only, doesn't run in React Native) — the RN equivalent stack is
// expo-localization (device locale detection) + i18next/react-i18next.
//
// IMPORTANT: every ta/*.json string here is machine-generated, not
// human-translated. This is a public safety app for real Tamil Nadu
// users — these need a native-speaker review pass before they're
// trusted in production. Don't remove this note when adding new keys.
//
// THREE ta STRINGS ARE DELIBERATELY LEFT IN ENGLISH. Do not "fix" them:
//
//     legal:termsBody · legal:privacyBody · legal:guidelinesBody
//
// They carry legal meaning and need a professional translator, not a
// machine and not a best-effort match against the app's vocabulary. An
// approximate translation of terms of service or a privacy policy is worse
// than an untranslated one, because it reads as authoritative while
// possibly saying something the operator never agreed to.
//
// A parity checker counts these as "untranslated" and it is right to. Five
// OTHER ta values are also byte-identical to their English source and are
// correct that way — `common:charCount`, `tickets:charCount`,
// `tickets:ticketRef` and two `rowLabel` accessibility strings are pure
// interpolation with no words in them. So the honest expected count for a
// ta==en audit is 8: five that need nothing, three that need a lawyer.
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import * as SecureStore from 'expo-secure-store';

import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enTabs from './locales/en/tabs.json';
import enReport from './locales/en/report.json';
import enRequestDetails from './locales/en/requestDetails.json';
import enInvite from './locales/en/invite.json';
import enFlaggedComments from './locales/en/flaggedComments.json';
import enImpactStories from './locales/en/impactStories.json';
import enMissionJournal from './locales/en/missionJournal.json';
import enTickets from './locales/en/tickets.json';
import enLegal from './locales/en/legal.json';
import enDeleteAccount from './locales/en/deleteAccount.json';
import enSponsor from './locales/en/sponsor.json';
import taCommon from './locales/ta/common.json';
import taAuth from './locales/ta/auth.json';
import taTabs from './locales/ta/tabs.json';
import taReport from './locales/ta/report.json';
import taRequestDetails from './locales/ta/requestDetails.json';
import taInvite from './locales/ta/invite.json';
import taFlaggedComments from './locales/ta/flaggedComments.json';
import taImpactStories from './locales/ta/impactStories.json';
import taMissionJournal from './locales/ta/missionJournal.json';
import taTickets from './locales/ta/tickets.json';
import taLegal from './locales/ta/legal.json';
import taDeleteAccount from './locales/ta/deleteAccount.json';
import taSponsor from './locales/ta/sponsor.json';

export type AppLocale = 'en' | 'ta';
export const NAMESPACES = [
  'common',
  'auth',
  'tabs',
  'report',
  'requestDetails',
  'invite',
  'flaggedComments',
  'impactStories',
  'missionJournal',
  'tickets',
  'legal',
  'deleteAccount',
  'sponsor',
] as const;

const LOCALE_STORAGE_KEY = 'uthavu_locale';

function detectDeviceLocale(): AppLocale {
  // This runs at module scope, and apps/mobile/index.ts imports this file
  // BEFORE registerRootComponent(App). A throw here therefore doesn't just
  // lose the device locale — it aborts the entry module, AppRegistry never
  // gets 'main', and the app dies on a blank screen with
  // `"main" has not been registered`. ExpoLocalization is a native module,
  // so it can be genuinely absent (a dev build predating the dependency) or
  // momentarily unavailable (Expo Go re-evaluating a bundle while its module
  // host is still being installed, which happens when more than one Metro
  // server is reload-driving the same client). Locale detection is a
  // nice-to-have; booting is not. Fall back to 'en' and let the user's
  // explicit choice, if any, arrive via loadPersistedLocale().
  try {
    const [first] = Localization.getLocales();
    return first?.languageCode === 'ta' ? 'ta' : 'en';
  } catch {
    return 'en';
  }
}

i18next.use(initReactI18next).init({
  resources: {
    en: {
      common: enCommon,
      auth: enAuth,
      tabs: enTabs,
      report: enReport,
      requestDetails: enRequestDetails,
      invite: enInvite,
      flaggedComments: enFlaggedComments,
      impactStories: enImpactStories,
      missionJournal: enMissionJournal,
      tickets: enTickets,
      legal: enLegal,
      deleteAccount: enDeleteAccount,
      sponsor: enSponsor,
    },
    ta: {
      common: taCommon,
      auth: taAuth,
      tabs: taTabs,
      report: taReport,
      requestDetails: taRequestDetails,
      invite: taInvite,
      flaggedComments: taFlaggedComments,
      impactStories: taImpactStories,
      missionJournal: taMissionJournal,
      tickets: taTickets,
      legal: taLegal,
      deleteAccount: taDeleteAccount,
      sponsor: taSponsor,
    },
  },
  lng: detectDeviceLocale(),
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: NAMESPACES,
  interpolation: { escapeValue: false },
  // No compatibilityJSON override — that option only exists to opt back
  // into the legacy v2/v3 plural format; modern CLDR-aligned pluralization
  // is the default from i18next v24+.
});

// Applies a previously-chosen language override, if the user ever picked
// one explicitly (Settings). Call once at startup, after i18next.init()
// above has already run synchronously with the device-detected locale —
// mirrors ThemeProvider's own "start with a default, then override once
// SecureStore resolves" pattern.
export async function loadPersistedLocale(): Promise<void> {
  const stored = await SecureStore.getItemAsync(LOCALE_STORAGE_KEY);
  if (stored === 'en' || stored === 'ta') {
    await i18next.changeLanguage(stored);
  }
}

export async function setAppLocale(locale: AppLocale): Promise<void> {
  await i18next.changeLanguage(locale);
  await SecureStore.setItemAsync(LOCALE_STORAGE_KEY, locale);
}

export function getAppLocale(): AppLocale {
  return i18next.language === 'ta' ? 'ta' : 'en';
}

export default i18next;
