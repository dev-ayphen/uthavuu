// FCM registration tokens are ~160 characters and are a capability: anyone
// holding one can be targeted by whoever also holds the project credentials.
// They are not as sensitive as a session token, but they identify a specific
// handset, so logs get a masked form rather than the real thing — the prefix is
// enough to correlate a failure with a row in `devices`, and the rest is noise.
export function maskPushToken(token: string): string {
  if (token.length <= 12) return `${token.slice(0, 4)}…`;
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}
