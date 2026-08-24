// Matches docs/API-CONTRACT.md § Profile, settings + docs/features/auth.md data model.

import { apiRequest } from '../lib/api';
import type { AuthUser } from './auth';

export type ProfileSetupInput = {
  fullName: string;
  lat: number;
  lng: number;
  city: string;
  district: string;
  // auth.md BR-5 — all optional, submitted as-is; blank strings are dropped
  // server-side (see CompleteProfileSchema's optionalTrimmed), not saved as ''.
  contactEmail?: string;
  language?: string;
  profession?: string;
  organization?: string;
  showProfession?: boolean;
  avatarUrl?: string;
};

export function completeProfileSetup(input: ProfileSetupInput): Promise<AuthUser> {
  return apiRequest('/users/me', { method: 'PATCH', auth: true, body: input });
}

export function updateMe(input: Partial<ProfileSetupInput & { email?: string }>): Promise<AuthUser> {
  return apiRequest('/users/me', { method: 'PATCH', auth: true, body: input });
}

// US-3a — uploads a local image URI (from expo-image-picker) to the API's
// (currently local-disk, see ADR 0008) storage and returns its public URL.
export function uploadImage(localUri: string): Promise<{ url: string }> {
  const filename = localUri.split('/').pop() ?? `photo-${Date.now()}.jpg`;
  const extension = /\.(\w+)$/.exec(filename)?.[1]?.toLowerCase();
  const mimeType =
    extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';

  const form = new FormData();
  // React Native's FormData accepts this { uri, name, type } shape for a file
  // part — not a real Blob/File, which don't exist for local URIs on-device.
  form.append('file', { uri: localUri, name: filename, type: mimeType } as unknown as Blob);

  return apiRequest('/uploads', { method: 'POST', auth: true, body: form });
}

export function getMe(): Promise<AuthUser> {
  return apiRequest('/users/me', { method: 'GET', auth: true });
}

export function updateRadius(radius: 1 | 3 | 5 | 10): Promise<AuthUser> {
  return apiRequest('/users/me/radius', { method: 'PATCH', auth: true, body: { radius } });
}

// Tells the server which language to render future push notifications in —
// separate from the in-app catalog switch (useAppLocale), which is instant
// and local. A best-effort background sync: if it fails, the user's local
// language already changed successfully, only a future push notification
// might render in the wrong language, not worth surfacing an error for.
export function updateLocale(locale: 'en' | 'ta'): Promise<AuthUser> {
  return apiRequest('/users/me/locale', { method: 'PATCH', auth: true, body: { locale } });
}

export function registerPushToken(token: string, platform: 'ios' | 'android'): Promise<void> {
  return apiRequest('/devices', { method: 'POST', auth: true, body: { token, platform } });
}

export type UserStats = {
  reportsCount: number;
  missionsCount: number;
};

export function getMyStats(): Promise<UserStats> {
  return apiRequest('/users/me/stats', { method: 'GET', auth: true });
}

export type MyInvite = { code: string; link: string };

// Profile → Invite Friends. Server lazy-generates the code on first call and
// returns the same one on every later call.
export function getMyInvite(): Promise<MyInvite> {
  return apiRequest('/users/me/invite', { method: 'GET', auth: true });
}

export type PrivacyDefaultsInput = Partial<{
  defaultAnonymous: boolean;
  defaultPhoneVisible: boolean;
}>;

// Settings → Privacy. Pre-fills the *next* report's anonymous/phoneVisible
// toggles — never touches already-published reports.
export function updatePrivacyDefaults(input: PrivacyDefaultsInput): Promise<AuthUser> {
  return apiRequest('/users/me/privacy', { method: 'PATCH', auth: true, body: input });
}

// Settings → Delete Account. Real, permanent removal (unlike Delete Report,
// which is soft) — every row that references this user cascades server-side.
export function deleteAccount(): Promise<void> {
  return apiRequest('/users/me', { method: 'DELETE', auth: true });
}
