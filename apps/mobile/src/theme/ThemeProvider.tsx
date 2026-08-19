import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { lightColors, darkColors, type ColorScheme } from './colors';

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_MODE_KEY = 'uthavu_theme_mode';

type ThemeContextValue = {
  colors: ColorScheme;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    SecureStore.getItemAsync(THEME_MODE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setModeState(stored);
      }
    });
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    SecureStore.setItemAsync(THEME_MODE_KEY, next);
  };

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';
  const colors = isDark ? darkColors : lightColors;

  const value = useMemo(() => ({ colors, isDark, mode, setMode }), [colors, isDark, mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
