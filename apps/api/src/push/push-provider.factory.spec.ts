// Provider selection, the production hard-block, credential parsing, and the
// dead-token classification rule. All pure — no database, no Firebase project.

import { collectDeadTokens, parseServiceAccount } from './fcm-push.provider';
import { createPushProvider, hasFcmCredentials } from './push-provider.factory';

const SERVICE_ACCOUNT = {
  project_id: 'uthavu-test',
  client_email: 'push@uthavu-test.iam.gserviceaccount.com',
  private_key:
    '-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----\n',
};

const REAL_CREDENTIALS: NodeJS.ProcessEnv = {
  FCM_PROJECT_ID: 'uthavu-test',
  FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(SERVICE_ACCOUNT),
};

describe('push provider selection', () => {
  it('uses the real FCM provider when both credentials are present', () => {
    expect(createPushProvider(REAL_CREDENTIALS).name).toBe('fcm');
  });

  it('falls back to the dev console provider when credentials are absent', () => {
    expect(createPushProvider({}).name).toBe('dev-console');
  });

  // Mirrors msg91's `Boolean(AUTH_KEY && TEMPLATE_ID)`: half-configured is not
  // configured. Half a credential pair cannot authenticate, so treating it as
  // "real" would swap a clear console fallback for a runtime auth failure.
  it.each([
    ['only a project id', { FCM_PROJECT_ID: 'uthavu-test' }],
    [
      'only a service account',
      { FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(SERVICE_ACCOUNT) },
    ],
    ['blank values', { FCM_PROJECT_ID: '', FCM_SERVICE_ACCOUNT_JSON: '' }],
  ])('treats %s as not configured', (_label, env: NodeJS.ProcessEnv) => {
    expect(hasFcmCredentials(env)).toBe(false);
    expect(createPushProvider(env).name).toBe('dev-console');
  });

  it('prefers real credentials over the fallback even in production', () => {
    const provider = createPushProvider({
      ...REAL_CREDENTIALS,
      NODE_ENV: 'production',
    });
    expect(provider.name).toBe('fcm');
  });
});

describe('production hard-block', () => {
  // The point of the whole ADR-0007-shaped design: a push that silently goes
  // nowhere in production is worse than a process that refuses to start.
  it('refuses to start in production without credentials', () => {
    expect(() => createPushProvider({ NODE_ENV: 'production' })).toThrow(
      /FCM_PROJECT_ID \/ FCM_SERVICE_ACCOUNT_JSON are required in production/,
    );
  });

  it('refuses to start in production with only half the credentials', () => {
    expect(() =>
      createPushProvider({
        NODE_ENV: 'production',
        FCM_PROJECT_ID: 'uthavu-test',
      }),
    ).toThrow(/required in production/);
  });

  it('allows the fallback outside production', () => {
    expect(() => createPushProvider({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => createPushProvider({ NODE_ENV: 'test' })).not.toThrow();
    expect(() => createPushProvider({})).not.toThrow();
  });
});

describe('service account parsing', () => {
  it('accepts raw JSON', () => {
    expect(parseServiceAccount(JSON.stringify(SERVICE_ACCOUNT))).toEqual({
      projectId: SERVICE_ACCOUNT.project_id,
      clientEmail: SERVICE_ACCOUNT.client_email,
      privateKey: SERVICE_ACCOUNT.private_key,
    });
  });

  // The form most people will actually use: a service account's private_key
  // has embedded newlines that .env files mangle.
  it('accepts the same JSON base64-encoded', () => {
    const encoded = Buffer.from(JSON.stringify(SERVICE_ACCOUNT)).toString(
      'base64',
    );
    expect(parseServiceAccount(encoded).clientEmail).toBe(
      SERVICE_ACCOUNT.client_email,
    );
  });

  it('rejects a value that is neither', () => {
    expect(() => parseServiceAccount('not json at all')).toThrow(
      /neither valid JSON nor base64-encoded JSON/,
    );
  });

  it('names the missing fields rather than failing deep inside firebase-admin', () => {
    expect(() =>
      parseServiceAccount(JSON.stringify({ project_id: 'x' })),
    ).toThrow(/missing required field\(s\): client_email, private_key/);
  });

  it('rejects a service account from a different project than FCM_PROJECT_ID', async () => {
    const provider = createPushProvider({
      FCM_PROJECT_ID: 'some-other-project',
      FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(SERVICE_ACCOUNT),
    });

    // Throws while resolving credentials, before any Firebase app is created —
    // which is why this test needs no Firebase project.
    await expect(
      provider.sendToTokens(['tok'], { title: 't', body: 'b' }),
    ).rejects.toThrow(/does not match the project_id/);
  });
});

describe('dead-token classification', () => {
  const tokens = ['tok-a', 'tok-b', 'tok-c'];

  it('collects tokens FCM says are unregistered or invalid', () => {
    const dead = collectDeadTokens(
      [
        { success: true },
        {
          success: false,
          error: { code: 'messaging/registration-token-not-registered' },
        },
        {
          success: false,
          error: { code: 'messaging/invalid-registration-token' },
        },
      ],
      tokens,
    );
    expect(dead).toEqual(['tok-b', 'tok-c']);
  });

  it('leaves transient failures alone so a live handset is never unsubscribed', () => {
    const dead = collectDeadTokens(
      [
        { success: false, error: { code: 'messaging/server-unavailable' } },
        { success: false, error: { code: 'messaging/message-rate-exceeded' } },
        { success: false, error: { code: 'messaging/internal-error' } },
      ],
      tokens,
    );
    expect(dead).toEqual([]);
  });

  // The blast-radius guard. FCM returns 'invalid-argument' for a malformed
  // MESSAGE as well as a malformed token, so honouring it would let a single
  // template bug delete every row in `devices` for every user — unrecoverably,
  // since a push token can only come back from the handset itself.
  it('never treats invalid-argument as a dead token', () => {
    const dead = collectDeadTokens(
      tokens.map(() => ({
        success: false,
        error: { code: 'messaging/invalid-argument' },
      })),
      tokens,
    );
    expect(dead).toEqual([]);
  });

  it('ignores a response list that is not index-aligned with the tokens', () => {
    const dead = collectDeadTokens(
      [
        {
          success: false,
          error: { code: 'messaging/registration-token-not-registered' },
        },
      ],
      tokens,
    );
    expect(dead).toEqual([]);
  });

  it('tolerates a failure with no error object', () => {
    expect(collectDeadTokens([{ success: false }], ['tok-a'])).toEqual([]);
  });
});
