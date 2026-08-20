import { useEffect, useState } from 'react';
import i18next, { getAppLocale, setAppLocale, type AppLocale } from './index';

// Mirrors ThemeProvider's { mode, setMode } shape — i18next already owns
// the actual language state, this hook just makes a component re-render
// when it changes (e.g. the Settings screen's language selector).
export function useAppLocale(): { locale: AppLocale; setLocale: (locale: AppLocale) => Promise<void> } {
  const [locale, setLocaleState] = useState<AppLocale>(getAppLocale());

  useEffect(() => {
    const onChange = () => setLocaleState(getAppLocale());
    i18next.on('languageChanged', onChange);
    return () => {
      i18next.off('languageChanged', onChange);
    };
  }, []);

  return { locale, setLocale: setAppLocale };
}
