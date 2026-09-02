import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';

// See admin/testing/admin-spec-db.ts: the factory is hoisted above the imports,
// so the database name has to be a literal here.
jest.mock('../db', () => {
  const postgresModule =
    jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<
    typeof import('drizzle-orm/postgres-js')
  >('drizzle-orm/postgres-js');
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_updates_feed_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import {
  communityUpdateStatuses,
  communityUpdates,
} from '../db/schema/updates-schema';
import { createSpecDatabase } from '../admin/testing/admin-spec-db';
import { UpdatesService } from './updates.service';

const DATABASE = 'uthavu_updates_feed_test';
const HOUR = 60 * 60 * 1000;

/**
 * The citizen feed, which is a query with five conditions on it. Each of the
 * five hides an announcement for a different reason, and getting any one of
 * them backwards either leaks a draft to the whole country or silently hides a
 * live safety notice — so each is asserted on its own row rather than inferred
 * from a single mixed fixture.
 */
describe('UpdatesService', () => {
  const service = new UpdatesService();
  const statusIds: Record<string, string> = {};

  const englishReader = uuidv7();
  const tamilReader = uuidv7();
  const noLocaleReader = uuidv7();
  const oddLocaleReader = uuidv7();

  let authorId: string;

  const insert = async (values: {
    titleEn: string;
    bodyEn?: string;
    titleTa?: string | null;
    bodyTa?: string | null;
    status?: 'draft' | 'published' | 'archived';
    publishAt?: Date | null;
    expiresAt?: Date | null;
    deletedAt?: Date | null;
    createdAt?: Date;
  }) => {
    const id = uuidv7();
    await db.insert(communityUpdates).values({
      id,
      titleEn: values.titleEn,
      bodyEn: values.bodyEn ?? 'English body',
      titleTa: values.titleTa ?? null,
      bodyTa: values.bodyTa ?? null,
      statusId: statusIds[values.status ?? 'published'],
      publishAt: values.publishAt ?? null,
      expiresAt: values.expiresAt ?? null,
      deletedAt: values.deletedAt ?? null,
      authorAdminUserId: authorId,
      ...(values.createdAt ? { createdAt: values.createdAt } : {}),
    });
    return id;
  };

  const titlesFor = async (userId: string) =>
    (await service.list(userId)).items.map((i) => i.title);

  beforeAll(async () => {
    await createSpecDatabase(DATABASE);

    for (const status of [
      { key: 'draft', label: 'Draft', sortOrder: 10 },
      { key: 'published', label: 'Published', sortOrder: 20 },
      { key: 'archived', label: 'Archived', sortOrder: 30 },
    ]) {
      const id = uuidv7();
      statusIds[status.key] = id;
      await db.insert(communityUpdateStatuses).values({ id, ...status });
    }

    authorId = uuidv7();
    await db.insert(user).values([
      { id: authorId, name: 'Author', email: `${authorId}@uthavu.org` },
      {
        id: englishReader,
        name: 'English',
        email: `${englishReader}@t.local`,
        locale: 'en',
      },
      {
        id: tamilReader,
        name: 'Tamil',
        email: `${tamilReader}@t.local`,
        locale: 'ta',
      },
      // Null until the client reports one — the normal state for a new account.
      { id: noLocaleReader, name: 'Unset', email: `${noLocaleReader}@t.local` },
      {
        id: oddLocaleReader,
        name: 'Odd',
        email: `${oddLocaleReader}@t.local`,
        locale: 'fr-CA',
      },
    ]);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  afterEach(async () => {
    await db.delete(communityUpdates);
  });

  it('shows a published update with no schedule at all', async () => {
    await insert({ titleEn: 'Live now' });
    expect(await titlesFor(englishReader)).toEqual(['Live now']);
  });

  it('hides drafts and archived updates', async () => {
    await insert({ titleEn: 'Draft', status: 'draft' });
    await insert({ titleEn: 'Archived', status: 'archived' });
    await insert({ titleEn: 'Published' });

    expect(await titlesFor(englishReader)).toEqual(['Published']);
  });

  it('hides a soft-deleted update even while its status is published', async () => {
    await insert({ titleEn: 'Retracted', deletedAt: new Date() });
    expect(await titlesFor(englishReader)).toEqual([]);
  });

  it('respects the publish schedule in both directions', async () => {
    await insert({
      titleEn: 'Tomorrow',
      publishAt: new Date(Date.now() + 24 * HOUR),
    });
    await insert({
      titleEn: 'Yesterday',
      publishAt: new Date(Date.now() - 24 * HOUR),
    });

    expect(await titlesFor(englishReader)).toEqual(['Yesterday']);
  });

  it('respects the expiry, and treats a null expiry as never expiring', async () => {
    await insert({
      titleEn: 'Expired',
      expiresAt: new Date(Date.now() - HOUR),
    });
    await insert({
      titleEn: 'Still valid',
      expiresAt: new Date(Date.now() + HOUR),
    });
    await insert({ titleEn: 'Never expires', expiresAt: null });

    expect((await titlesFor(englishReader)).sort()).toEqual(
      ['Never expires', 'Still valid'].sort(),
    );
  });

  // ---------------------------------------------------------------- locale

  it('gives a Tamil reader Tamil, per field, and falls back where it is missing', async () => {
    await insert({
      titleEn: 'Water supply notice',
      bodyEn: 'Tankers arrive at 6am.',
      titleTa: 'குடிநீர் அறிவிப்பு',
      // Body deliberately untranslated — a half-translated announcement must
      // render each field in the best language it actually has, not fall back
      // wholesale and discard a real translation.
      bodyTa: null,
    });

    const { items } = await service.list(tamilReader);
    expect(items[0].title).toBe('குடிநீர் அறிவிப்பு');
    expect(items[0].body).toBe('Tankers arrive at 6am.');
  });

  it('gives an English reader English even when a translation exists', async () => {
    await insert({
      titleEn: 'Water supply notice',
      titleTa: 'குடிநீர் அறிவிப்பு',
    });
    expect(await titlesFor(englishReader)).toEqual(['Water supply notice']);
  });

  it('falls back to English for a null or unrecognised locale rather than failing', async () => {
    await insert({
      titleEn: 'Water supply notice',
      titleTa: 'குடிநீர் அறிவிப்பு',
    });

    expect(await titlesFor(noLocaleReader)).toEqual(['Water supply notice']);
    expect(await titlesFor(oddLocaleReader)).toEqual(['Water supply notice']);
  });

  it('reads the locale from the database, so a change takes effect immediately', async () => {
    await insert({
      titleEn: 'Water supply notice',
      titleTa: 'குடிநீர் அறிவிப்பு',
    });

    await db
      .update(user)
      .set({ locale: 'ta' })
      .where(eq(user.id, noLocaleReader));
    expect(await titlesFor(noLocaleReader)).toEqual(['குடிநீர் அறிவிப்பு']);
    await db
      .update(user)
      .set({ locale: null })
      .where(eq(user.id, noLocaleReader));
  });

  // ------------------------------------------------------------- ordering

  it('orders newest first by publish time, falling back to creation time', async () => {
    const old = new Date(Date.now() - 72 * HOUR);
    // Created long ago, scheduled to publish recently: it is the NEWEST
    // announcement from a reader's point of view, and ordering by created_at
    // alone would bury it.
    await insert({
      titleEn: 'Scheduled recently',
      createdAt: old,
      publishAt: new Date(Date.now() - HOUR),
    });
    await insert({
      titleEn: 'Written two days ago',
      createdAt: new Date(Date.now() - 48 * HOUR),
    });
    await insert({ titleEn: 'Written three days ago', createdAt: old });

    expect(await titlesFor(englishReader)).toEqual([
      'Scheduled recently',
      'Written two days ago',
      'Written three days ago',
    ]);
  });

  it('always returns a publishedAt, using creation time when nothing was scheduled', async () => {
    await insert({ titleEn: 'Unscheduled' });
    const scheduled = new Date(Date.now() - HOUR);
    await insert({ titleEn: 'Scheduled', publishAt: scheduled });

    const { items } = await service.list(englishReader);
    for (const item of items) {
      expect(item.publishedAt).toEqual(expect.any(String));
    }
    expect(items.find((i) => i.title === 'Scheduled')!.publishedAt).toBe(
      scheduled.toISOString(),
    );
  });

  it('returns only the four fields the mobile client is built against', async () => {
    await insert({ titleEn: 'Notice' });
    const { items } = await service.list(englishReader);
    // No status, no schedule, no author, no Tamil columns — the citizen shape
    // is a separate projection, not the admin one with fields removed.
    expect(Object.keys(items[0]).sort()).toEqual([
      'body',
      'id',
      'publishedAt',
      'title',
    ]);
  });
});
