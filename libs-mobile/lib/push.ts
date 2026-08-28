// CLAUDE.md's FCM push integration — registration only. There's no
// FCM_SERVICE_ACCOUNT_JSON credential configured yet, so nothing sends a
// real push (same situation msg91 was in before ADR 0006/0007: build the
// real scaffolding now, wire the send once the credential exists).
//
// expo-notifications is reached only through ./notifications — importing it
// directly crashes the app at boot in Expo Go on Android. See that file.
import { Platform } from 'react-native';
import {
  getDevicePushToken,
  getNotificationPermission,
  isPushSupported,
  requestNotificationPermission,
} from './notifications';
import { registerPushToken } from '../api/users';

// Best-effort: a user who denies notifications, or a token fetch that
// fails, should never block using the app. Errors are swallowed, not
// thrown or alerted.
export async function registerForPushNotifications(): Promise<void> {
  // Expo Go can't receive remote push at all (SDK 53+). Returning early keeps
  // the dev build and Expo Go on the same code path instead of relying on the
  // catch below to hide an error we already know is coming.
  if (!isPushSupported) return;

  try {
    let status = await getNotificationPermission();

    // Only prompt if the user has never been asked — don't re-prompt
    // someone who already said no.
    if (status === 'undetermined') {
      status = await requestNotificationPermission();
    }

    if (status !== 'granted') return;

    // The raw FCM/APNs device token, not an Expo-relay token — this
    // project sends via FCM directly, no expo.extra.eas.projectId configured.
    const token = await getDevicePushToken();
    if (!token) return;

    await registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
  } catch {
    // Best-effort — see the comment above.
  }
}
