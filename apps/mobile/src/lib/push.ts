// CLAUDE.md's FCM push integration — registration only. There's no
// FCM_SERVICE_ACCOUNT_JSON credential configured yet, so nothing sends a
// real push (same situation msg91 was in before ADR 0006/0007: build the
// real scaffolding now, wire the send once the credential exists).
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { registerPushToken } from '../api/users';

// Best-effort: a user who denies notifications, or a token fetch that
// fails, should never block using the app. Errors are swallowed, not
// thrown or alerted.
export async function registerForPushNotifications(): Promise<void> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;

    // Only prompt if the user has never been asked — don't re-prompt
    // someone who already said no.
    if (status === 'undetermined') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }

    if (status !== 'granted') return;

    // The raw FCM/APNs device token, not an Expo-relay token — this
    // project sends via FCM directly, no expo.extra.eas.projectId configured.
    const token = await Notifications.getDevicePushTokenAsync();
    await registerPushToken(token.data, Platform.OS === 'ios' ? 'ios' : 'android');
  } catch {
    // Best-effort — see the comment above.
  }
}
