// Session token storage. Per docs/features/auth.md BR-6, sessions are long-lived
// (60-day sliding) — the token just needs to survive app restarts in secure storage;
// expiry/refresh is the server's job (Better Auth's `session` table), not this file's.

import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'uthavu_session_token';
const ONBOARDING_SEEN_KEY = 'uthavu_onboarding_seen';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function hasSession(): Promise<boolean> {
  const token = await getToken();
  return token != null;
}

// Set once a user completes signup (Profile Setup) or logs back in — lets Splash
// route a phone-only visitor straight to Login instead of replaying onboarding.
export async function markOnboardingSeen(): Promise<void> {
  await SecureStore.setItemAsync(ONBOARDING_SEEN_KEY, '1');
}

export async function hasSeenOnboarding(): Promise<boolean> {
  return (await SecureStore.getItemAsync(ONBOARDING_SEEN_KEY)) === '1';
}

// Dev-only escape hatch (see the long-press on Splash) — iOS Keychain data often
// survives a plain app reinstall, so there's otherwise no easy way to re-see
// onboarding or force a fresh login while testing.
export async function clearAllForTesting(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(ONBOARDING_SEEN_KEY),
  ]);
}
