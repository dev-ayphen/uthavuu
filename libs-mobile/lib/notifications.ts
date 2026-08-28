// The only place `expo-notifications` may be loaded.
//
// Importing that package is FATAL in Expo Go on Android as of SDK 53+: its
// `index.js` re-exports `DevicePushTokenAutoRegistration.fx`, which calls
// `addPushTokenListener()` at MODULE SCOPE
// (expo-notifications/build/DevicePushTokenAutoRegistration.fx.js:75-78), and
// that calls `warnOfExpoGoPushUsage()`, which `throw`s on Android in Expo Go
// (build/warnOfExpoGoPushUsage.js:8). The throw happens while the module graph
// is still evaluating, so it surfaces as a "[runtime not ready]" red screen at
// app boot and NO try/catch at a call site can intercept it — the import runs
// before any of our code does.
//
// Hence: a type-only import (erased at runtime) plus a lazy `require` that is
// never reached in Expo Go. Remote push genuinely does not work in Expo Go on
// either platform since SDK 53 — it needs a development build — so the whole
// feature is gated on that rather than on the platform, which keeps iOS and
// Android behaving the same way in development.
import { isRunningInExpoGo } from 'expo';
import type * as ExpoNotifications from 'expo-notifications';

/** 'unavailable' means the module could not be loaded, not that the user said no. */
export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

/**
 * False in Expo Go. Callers must treat this as "the device cannot receive push
 * at all" and degrade — never as a transient failure worth retrying.
 */
export const isPushSupported = !isRunningInExpoGo();

function loadNotifications(): typeof ExpoNotifications | null {
  if (!isPushSupported) return null;
  // Deliberately lazy — see the file header. Metro still bundles the module;
  // what matters is that it is not *evaluated* under Expo Go.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-notifications') as typeof ExpoNotifications;
}

export async function getNotificationPermission(): Promise<PermissionState> {
  const notifications = loadNotifications();
  if (!notifications) return 'unavailable';
  const { status } = await notifications.getPermissionsAsync();
  return status as PermissionState;
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  const notifications = loadNotifications();
  if (!notifications) return 'unavailable';
  const { status } = await notifications.requestPermissionsAsync();
  return status as PermissionState;
}

/** The raw FCM/APNs device token, or null when push is unavailable. */
export async function getDevicePushToken(): Promise<string | null> {
  const notifications = loadNotifications();
  if (!notifications) return null;
  const token = await notifications.getDevicePushTokenAsync();
  return typeof token.data === 'string' ? token.data : null;
}
