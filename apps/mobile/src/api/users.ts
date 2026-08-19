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

export function registerPushToken(token: string, platform: 'ios' | 'android'): Promise<void> {
  return apiRequest('/devices', { method: 'POST', auth: true, body: { token, platform } });
}
