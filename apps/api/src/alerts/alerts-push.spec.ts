// The alerts -> push wiring. Three things are load-bearing here and each has a
// test: an alert row is also pushed, the push is rendered in the RECIPIENT's
// locale, and a push failure can never take the originating action down with
// it.
//
// Runs against the real dev database like the other service specs — the point
// of the last group is that a real INSERT survives a failing push, which a
// mocked db could not demonstrate.

import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { alerts } from '../db/schema/alerts-schema';
import { reportCategories, reportStatuses, reports } from '../db/schema/reports-schema';
import { PushService } from '../push/push.service';
import type {
  PushMessage,
  PushProvider,
  PushSendResult,
} from '../push/push-provider.interface';
import { AlertsService } from './alerts.service';

class RecordingPushService extends PushService {
  sends: { userId: string; message: PushMessage }[] = [];

  constructor() {
    super({
      name: 'unused',
      sendToTokens: () => Promise.resolve({ sent: 0, failed: 0, deadTokens: [] }),
    });
  }

  // Overridden rather than driven through a fake provider: this spec is about
  // what AlertsService hands to PushService, not about device lookup (which
  // push.service.spec.ts covers against real `devices` rows).
  sendToUser(userId: string, message: PushMessage): Promise<PushSendResult> {
    this.sends.push({ userId, message });
    return Promise.resolve({ sent: 1, failed: 0, deadTokens: [] });
  }
}

// Fails the way a real outage does — from inside the provider, through the
// service's own error handling.
const explodingProvider: PushProvider = {
  name: 'exploding',
  sendToTokens: () => Promise.reject(new Error('FCM is unreachable')),
};

describe('AlertsService — push delivery', () => {
  let reporterId: string;
  let tamilUserId: string;
  let unsetLocaleUserId: string;
  let reportId: string;
  let warnSpy: jest.SpyInstance;

  beforeAll(async () => {
    reporterId = uuidv7();
    tamilUserId = uuidv7();
    unsetLocaleUserId = uuidv7();

    await db.insert(user).values([
      { id: reporterId, name: 'Reporter', email: `${reporterId}@test.local`, phoneNumber: `+91-${reporterId}`, locale: 'en' },
      { id: tamilUserId, name: 'Tamil Reader', email: `${tamilUserId}@test.local`, phoneNumber: `+91-${tamilUserId}`, locale: 'ta' },
      { id: unsetLocaleUserId, name: 'No Locale', email: `${unsetLocaleUserId}@test.local`, phoneNumber: `+91-${unsetLocaleUserId}` },
    ]);

    const [category] = await db.select().from(reportCategories).where(eq(reportCategories.key, 'medicalHelp'));
    const [openStatus] = await db.select().from(reportStatuses).where(eq(reportStatuses.key, 'open'));

    reportId = uuidv7();
    await db.insert(reports).values({
      id: reportId,
      reporterId,
      categoryId: category.id,
      statusId: openStatus.id,
      title: 'Need an ambulance',
      description: 'Test',
      lat: 13.08,
      lng: 80.27,
      neededVolunteers: 1,
      expiryAt: new Date(Date.now() + 60 * 60_000),
    });
  });

  afterAll(async () => {
    // alerts cascade from user and from reports.
    await db.delete(reports).where(eq(reports.id, reportId));
    await db.delete(user).where(eq(user.id, reporterId));
    await db.delete(user).where(eq(user.id, tamilUserId));
    await db.delete(user).where(eq(user.id, unsetLocaleUserId));
  });

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    warnSpy.mockRestore();
    await db.delete(alerts).where(eq(alerts.userId, reporterId));
    await db.delete(alerts).where(eq(alerts.userId, tamilUserId));
    await db.delete(alerts).where(eq(alerts.userId, unsetLocaleUserId));
  });

  async function alertsFor(userId: string) {
    return db.select().from(alerts).where(eq(alerts.userId, userId));
  }

  // ------------------------------------------------------------- delivery

  it('pushes every alert it writes', async () => {
    const push = new RecordingPushService();
    await new AlertsService(push).create(
      reporterId,
      'volunteer_accepted',
      { volunteerName: 'Priya', reportTitle: 'Need an ambulance' },
      reportId,
    );

    expect(await alertsFor(reporterId)).toHaveLength(1);
    expect(push.sends).toHaveLength(1);
    expect(push.sends[0].userId).toBe(reporterId);
    expect(push.sends[0].message.title).toBe('Volunteer Accepted');
    expect(push.sends[0].message.body).toContain('Priya');
  });

  it('carries the type and reportId the mobile deep link needs, as strings', async () => {
    const push = new RecordingPushService();
    await new AlertsService(push).create(
      reporterId,
      'mission_completed',
      { volunteerName: 'Priya', reportTitle: 'Need an ambulance' },
      reportId,
    );

    // uthavu://requests/:reportId — FCM data values must be strings.
    expect(push.sends[0].message.data).toEqual({ type: 'mission_completed', reportId });
  });

  it('omits reportId entirely for an alert with no report to open', async () => {
    const push = new RecordingPushService();
    await new AlertsService(push).create(reporterId, 'volunteer_released', {
      volunteerName: null,
      reportTitle: 'Need an ambulance',
    });

    expect(push.sends[0].message.data).toEqual({ type: 'volunteer_released' });
  });

  // --------------------------------------------------------------- locale

  it('renders the push in the recipient’s locale, not English', async () => {
    const push = new RecordingPushService();
    await new AlertsService(push).create(tamilUserId, 'volunteer_accepted', {
      volunteerName: 'Priya',
      reportTitle: 'Need an ambulance',
    });

    expect(push.sends[0].message.title).toBe('தன்னார்வலர் ஏற்றுக்கொண்டார்');
    expect(push.sends[0].message.body).toContain('Priya');
    expect(push.sends[0].message.body).toContain('வருகிறார்');
  });

  it('uses each locale’s own fallback wording for an unnamed volunteer', async () => {
    const push = new RecordingPushService();
    await new AlertsService(push).create(tamilUserId, 'volunteer_accepted', {
      volunteerName: null,
      reportTitle: 'Need an ambulance',
    });

    expect(push.sends[0].message.body).toContain('ஒரு தன்னார்வலர்');
  });

  it('falls back to English when the recipient never reported a locale', async () => {
    const push = new RecordingPushService();
    await new AlertsService(push).create(unsetLocaleUserId, 'mission_completed', {
      volunteerName: 'Priya',
      reportTitle: 'Need an ambulance',
    });

    expect(push.sends[0].message.title).toBe('Mission Completed');
  });

  it('still stores the English rendering on the row regardless of push locale', async () => {
    const push = new RecordingPushService();
    await new AlertsService(push).create(tamilUserId, 'volunteer_accepted', {
      volunteerName: 'Priya',
      reportTitle: 'Need an ambulance',
    });

    // The row stays self-describing in English (alert-templates.ts); only the
    // push is localized, because a push has no client to re-render it.
    const [row] = await alertsFor(tamilUserId);
    expect(row.title).toBe('Volunteer Accepted');
  });

  // ---------------------------------------------------- failure isolation

  it('writes the alert even when the push provider is down', async () => {
    const service = new AlertsService(new PushService(explodingProvider));

    await expect(
      service.create(reporterId, 'volunteer_accepted', {
        volunteerName: 'Priya',
        reportTitle: 'Need an ambulance',
      }),
    ).resolves.toBeUndefined();

    // The originating action's own record survived. This is the guarantee that
    // makes push safe to call from inside report creation, mission accept and
    // admin moderation: an emergency report is still created if Firebase is
    // down.
    expect(await alertsFor(reporterId)).toHaveLength(1);
  });

  it('falls back to English for a stale locale rather than failing the send', async () => {
    // A locale the catalog no longer ships (or never did). Getting a push in
    // the wrong language is a bad experience; a push that never arrives because
    // of a stale string is a worse one — same rule alert-templates.ts states.
    await db.update(user).set({ locale: 'fr-CA' }).where(eq(user.id, unsetLocaleUserId));

    const push = new RecordingPushService();
    await new AlertsService(push).create(unsetLocaleUserId, 'volunteer_accepted', {
      volunteerName: 'Priya',
      reportTitle: 'Need an ambulance',
    });

    expect(push.sends[0].message.title).toBe('Volunteer Accepted');

    await db.update(user).set({ locale: null }).where(eq(user.id, unsetLocaleUserId));
  });
});
