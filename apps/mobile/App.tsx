import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RootNavigator from './src/navigation/RootNavigator';
import { ThemeProvider, useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { loadPersistedLocale } from '@uthavu/libs-mobile/i18n';

const queryClient = new QueryClient();

function AppShell() {
  const { isDark } = useTheme();

  useEffect(() => {
    // i18next already initialized synchronously with the device-detected
    // locale (index.ts) — this only applies an explicit override if the
    // user picked one in Settings before.
    loadPersistedLocale();
  }, []);

  return (
    <>
      <RootNavigator />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AppShell />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
