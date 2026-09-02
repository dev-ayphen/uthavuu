import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import {
  communityUpdateStatuses,
  communityUpdates,
} from '../db/schema/updates-schema';
import { pickCopy, resolveUpdateLocale } from './update-locale';

/**
 * How many announcements the feed returns.
 *
 * Unpaginated, like every other citizen endpoint in this API — the mobile app
 * scrolls a short list, and pagination is an admin-console concern
 * (admin-pagination.ts explains why the split exists). The cap is the same 50
 * AlertsService.list() uses, and it is the reason this can stay unpaginated: it
 * bounds the payload regardless of how many announcements accumulate.
 */
const FEED_LIMIT = 50;

/**
 * Community -> Updates, as citizens see it.
 *
 * Four fields, resolved to one language, filtered to what is live at this
 * instant. Everything the console cares about — drafts, archives, the
 * schedule, both language pairs, the author, the soft-delete state — is absent
 * by construction rather than by redaction, which is the ADR 0009 shape: this
 * is a separate projection, not the admin one with an `if (isAdmin)` in it.
 */
@Injectable()
export class UpdatesService {
  async list(userId: string) {
    // Read from the database rather than taken from the session payload. It is
    // one indexed primary-key lookup, and it means a locale the user changed in
    // this session is honoured immediately instead of on their next sign-in.
    const [reader] = await db
      .select({ locale: user.locale })
      .from(user)
      .where(eq(user.id, userId));

    const locale = resolveUpdateLocale(reader?.locale);

    const rows = await db
      .select({
        id: communityUpdates.id,
        titleEn: communityUpdates.titleEn,
        titleTa: communityUpdates.titleTa,
        bodyEn: communityUpdates.bodyEn,
        bodyTa: communityUpdates.bodyTa,
        publishAt: communityUpdates.publishAt,
        createdAt: communityUpdates.createdAt,
      })
      .from(communityUpdates)
      .innerJoin(
        communityUpdateStatuses,
        eq(communityUpdates.statusId, communityUpdateStatuses.id),
      )
      .where(
        and(
          // Drafts and archived updates are not announcements yet, or not any
          // more. Resolved through the lookup table by key, never a hardcoded
          // id.
          eq(communityUpdateStatuses.key, 'published'),
          isNull(communityUpdates.deletedAt),
          // NULL publish_at means "as soon as it is published" — an
          // announcement written and released in one sitting never gets a
          // schedule, and must not be invisible for want of one.
          or(
            isNull(communityUpdates.publishAt),
            sql`${communityUpdates.publishAt} <= now()`,
          ),
          // NULL expires_at means "never expires". Note `>` not `>=`: an
          // announcement whose expiry is this exact instant has expired.
          or(
            isNull(communityUpdates.expiresAt),
            sql`${communityUpdates.expiresAt} > now()`,
          ),
        ),
      )
      // now() is the DATABASE's clock, in both predicates above and here. Using
      // a JS `new Date()` instead would compare the API container's clock
      // against timestamps Postgres wrote, so a few seconds of drift could
      // surface an announcement early or hide one that is due.
      //
      // Ordered by the same coalesce the response exposes as `publishedAt`, so
      // "newest first" means the same thing the reader can see. id desc breaks
      // ties in true write order (uuidv7 is time-ordered).
      .orderBy(
        desc(
          sql`coalesce(${communityUpdates.publishAt}, ${communityUpdates.createdAt})`,
        ),
        desc(communityUpdates.id),
      )
      .limit(FEED_LIMIT);

    return {
      items: rows.map((row) => ({
        id: row.id,
        title: pickCopy(locale, row.titleEn, row.titleTa),
        body: pickCopy(locale, row.bodyEn, row.bodyTa),
        // `publish_at` when it was scheduled, `created_at` when it was not —
        // never null. An update with no schedule went live when it was written,
        // so its creation time IS its publication time, and handing the client
        // a null here would leave a published announcement with no date to
        // show. Same expression as the sort above, deliberately.
        publishedAt: (row.publishAt ?? row.createdAt).toISOString(),
      })),
    };
  }
}
