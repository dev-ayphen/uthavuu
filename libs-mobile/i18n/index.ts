// Mobile's only i18n surface (App Profile: English + Tamil, mobile-only —
// apps/admin stays english-only chrome). react-i18next, not next-intl
// (Next.js-only, doesn't run in React Native) — the RN equivalent stack is
// expo-localization (device locale detection) + i18next/react-i18next.
//
// IMPORTANT: every ta/*.json string here is machine-generated, not
// human-translated. This is a public safety app for real Tamil Nadu
// users — these need a native-speaker review pass before they're
// trusted in production. Don't remove this note when adding new keys.
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import * as SecureStore from 'expo-secure-store';

import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enTabs from './locales/en/tabs.json';
import enReport from './locales/en/report.json';
import enRequestDetails from './locales/en/requestDetails.json';
import taCommon from './locales/ta/common.json';
import taAuth from './locales/ta/auth.json';
import taTabs from './locales/ta/tabs.json';
import taReport from './locales/ta/report.json';
import taRequestDetails from './locales/ta/requestDetails.json';

export type AppLocale = 'en' | 'ta';
export const NAMESPACES = ['common', 'auth', 'tabs', 'report', 'requestDetails'] as const;

const LOCALE_STORAGE_KEY = 'uthavu_locale';

function detectDeviceLocale(): AppLocale {
  const [first] = Localization.getLocales();
  return first?.languageCode === 'ta' ? 'ta' : 'en';
}

i18next.use(initReactI18next).init({
  resources: {
    en: { common: enCommon, auth: enAuth, tabs: enTabs, report: enReport, requestDetails: enRequestDetails },
    ta: { common: taCommon, auth: taAuth, tabs: taTabs, report: taReport, requestDetails: taRequestDetails },
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
