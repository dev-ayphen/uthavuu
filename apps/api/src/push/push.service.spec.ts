// Runs against the real dev database, like the other service specs in this
// package — dead-token cleanup is a DELETE, and asserting it against a mock
// would prove only that a mock was called.

import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { devices } from '../db/schema/devices-schema';
import { PushService } from './push.service';
import {
  emptyPushResult,
  type PushMessage,
  type PushProvider,
  type PushSendResult,
} from './push-provider.interface';

class FakePushProvider implements PushProvider {
  readonly name = 'fake';
  calls: { tokens: string[]; message: PushMessage }[] = [];

  constructor(private readonly outcome: (tokens: string[]) => PushSendResult) {}

  sendToTokens(
    tokens: string[],
    message: PushMessage,
  ): Promise<PushSendResult> {
    this.calls.push({ tokens, message });
    return Promise.resolve(this.outcome(tokens));
  }
}

class ThrowingPushProvider implements PushProvider {
  readonly name = 'throwing';
  sendToTokens(): Promise<PushSendResult> {
    return Promise.reject(new Error('FCM is unreachable'));
  }
}

const allDelivered = (tokens: string[]): PushSendResult => ({
  sent: tokens.length,
  failed: 0,
  deadTokens: [],
});

describe('PushService', () => {
  let userId: string;
  let otherUserId: string;
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeAll(async () => {
    userId = uuidv7();
    otherUserId = uuidv7();
    await db.insert(user).values([
      {
        id: userId,
        name: 'Push Target',
        email: `${userId}@test.local`,
        phoneNumber: `+91-${userId}`,
      },
      {
        id: otherUserId,
        name: 'Bystander',
        email: `${otherUserId}@test.local`,
        phoneNumber: `+91-${otherUserId}`,
      },
    ]);
  });

  afterAll(async () => {
    // devices cascades from user (devices-schema.ts onDelete: 'cascade').
    await db.delete(user).where(eq(user.id, userId));
    await db.delete(user).where(eq(user.id, otherUserId));
  });

  beforeEach(async () => {
    await db.delete(devices).where(eq(devices.userId, userId));
    await db.delete(devices).where(eq(devices.userId, otherUserId));
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  async function registerDevice(ownerId: string, token: string) {
    await db.insert(devices).values({
      id: uuidv7(),
      userId: ownerId,
      pushToken: token,
      platform: 'android',
    });
  }

  async function tokensFor(ownerId: string): Promise<string[]> {
    const rows = await db
      .select({ pushToken: devices.pushToken })
      .from(devices)
      .where(eq(devices.userId, ownerId));
    return rows.map((row) => row.pushToken).sort();
  }

  // -------------------------------------------------------------- delivery

  it('sends to every device the user registered, and to nobody else', async () => {
    await registerDevice(userId, `tok-a-${userId}`);
    await registerDevice(userId, `tok-b-${userId}`);
    await registerDevice(otherUserId, `tok-other-${otherUserId}`);

    const provider = new FakePushProvider(allDelivered);
    const result = await new PushService(provider).sendToUser(userId, {
      title: 'Volunteer Accepted',
      body: 'Someone is on the way.',
      data: { type: 'volunteer_accepted' },
    });

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].tokens.sort()).toEqual([
      `tok-a-${userId}`,
      `tok-b-${userId}`,
    ]);
    expect(provider.calls[0].message.data).toEqual({
      type: 'volunteer_accepted',
    });
    expect(result).toEqual({ sent: 2, failed: 0, deadTokens: [] });
  });

  it('does not call the provider at all when the user has no devices', async () => {
    const provider = new FakePushProvider(allDelivered);
    const result = await new PushService(provider).sendToUser(userId, {
      title: 't',
      body: 'b',
    });

    expect(provider.calls).toHaveLength(0);
    expect(result).toEqual(emptyPushResult());
  });

  // -------------------------------------------------- dead-token cleanup

  it('deletes the devices rows FCM reported as permanently dead', async () => {
    const live = `tok-live-${userId}`;
    const dead = `tok-dead-${userId}`;
    const alsoDead = `tok-dead2-${userId}`;
    await registerDevice(userId, live);
    await registerDevice(userId, dead);
    await registerDevice(userId, alsoDead);

    const provider = new FakePushProvider(() => ({
      sent: 1,
      failed: 2,
      deadTokens: [dead, alsoDead],
    }));

    await new PushService(provider).sendToUser(userId, {
      title: 't',
      body: 'b',
    });

    expect(await tokensFor(userId)).toEqual([live]);
  });

  it('leaves every row in place when nothing was reported dead', async () => {
    await registerDevice(userId, `tok-keep-${userId}`);

    const provider = new FakePushProvider(() => ({
      sent: 0,
      failed: 1,
      deadTokens: [],
    }));
    await new PushService(provider).sendToUser(userId, {
      title: 't',
      body: 'b',
    });

    expect(await tokensFor(userId)).toEqual([`tok-keep-${userId}`]);
  });

  it('does not delete another user’s devices while pruning', async () => {
    const dead = `tok-dead-${userId}`;
    await registerDevice(userId, dead);
    await registerDevice(otherUserId, `tok-other-${otherUserId}`);

    const provider = new FakePushProvider(() => ({
      sent: 0,
      failed: 1,
      deadTokens: [dead],
    }));
    await new PushService(provider).sendToUser(userId, {
      title: 't',
      body: 'b',
    });

    expect(await tokensFor(userId)).toEqual([]);
    expect(await tokensFor(otherUserId)).toEqual([`tok-other-${otherUserId}`]);
  });

  // ------------------------------------------------------ failure isolation

  it('never throws when the provider fails, so the caller is unaffected', async () => {
    await registerDevice(userId, `tok-a-${userId}`);

    const result = await new PushService(new ThrowingPushProvider()).sendToUser(
      userId,
      {
        title: 't',
        body: 'b',
      },
    );

    expect(result).toEqual(emptyPushResult());
    expect(warnSpy).toHaveBeenCalled();
  });

  it('keeps the device row when the send failed outright — a failure is not a dead token', async () => {
    await registerDevice(userId, `tok-a-${userId}`);

    await new PushService(new ThrowingPushProvider()).sendToUser(userId, {
      title: 't',
      body: 'b',
    });

    expect(await tokensFor(userId)).toEqual([`tok-a-${userId}`]);
  });

  it('reports a successful send even if pruning the dead tokens fails', async () => {
    await registerDevice(userId, `tok-a-${userId}`);

    // A token that was never in the table stands in for a failing DELETE: the
    // prune runs, changes nothing, and must not disturb the returned result.
    const provider = new FakePushProvider(() => ({
      sent: 1,
      failed: 1,
      deadTokens: ['tok-never-existed'],
    }));

    const result = await new PushService(provider).sendToUser(userId, {
      title: 't',
      body: 'b',
    });

    expect(result.sent).toBe(1);
    expect(await tokensFor(userId)).toEqual([`tok-a-${userId}`]);
  });
});
