import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { platformSettings } from '../db/schema/settings-schema';
import type { PlatformSettingsRow } from '../db/schema/settings-schema';
import { toPlatformConfig } from '../config/platform-settings';
import type { PlatformConfig } from '../config/platform-settings';
import { AdminAuditService } from './admin-audit.service';
import type { AdminIdentity } from './admin-rbac';
import type { AdminRequestMeta } from './admin-request-meta';
import type { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';

/**
 * The admin projection: everything `GET /config` returns, plus the provenance a
 * console needs to show "last changed by X at Y".
 */
export interface AdminSettings extends PlatformConfig {
  updatedAt: string;
  updatedBy: { id: string; name: string } | null;
  /** See the `updatedByDeleted` derivation in toResponse(). */
  updatedByDeleted: boolean;
}

/**
 * The fields a PATCH may touch, and the ones the audit diff is scoped to.
 *
 * `id`, `singleton`, `updatedBy`, `createdAt` and `updatedAt` are absent on
 * purpose: the first two are the singleton machinery, the last three are
 * written by this service and are not the operator's to set.
 */
const EDITABLE_FIELDS = [
  'appName',
  'supportEmail',
  'supportPhone',
  'maxPhotosPerReport',
  'maxVolunteersPerReport',
  'defaultRadiusKm',
  'allowAnonymousReports',
  'commentsEnabled',
  'commentFlaggingEnabled',
  'maintenanceMode',
  'readOnlyMode',
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];

/**
 * Platform -> App Settings: the console's read/write half of the one
 * configuration row.
 *
 * The citizen twin is `GET /config` (config/platform-config.controller.ts) and
 * there is no role branch between them, per ADR 0009 — this projection simply
 * adds provenance the mobile app has no use for.
 *
 * Gated on `platform:manage` at the controller, which is the super-admin-only
 * permission (admin-rbac.ts). That is deliberate for a screen holding two kill
 * switches: an Ops Admin can moderate content but cannot pause the platform.
 */
@Injectable()
export class AdminSettingsService {
  constructor(private readonly auditService: AdminAuditService) {}

  async get(): Promise<AdminSettings> {
    const [row] = await db
      .select({ settings: platformSettings, updatedByUser: user })
      .from(platformSettings)
      // leftJoin, not innerJoin: `updated_by` is nullable both before anyone
      // has changed anything and after the admin who did has been deleted
      // (ON DELETE SET NULL). An innerJoin would make the settings screen 404
      // because a member of staff left.
      .leftJoin(user, eq(platformSettings.updatedBy, user.id))
      .where(eq(platformSettings.singleton, true))
      .limit(1);

    if (!row) throw this.notSeeded();

    return this.toResponse(
      row.settings,
      row.updatedByUser
        ? { id: row.updatedByUser.id, name: row.updatedByUser.name }
        : null,
    );
  }

  async update(
    admin: AdminIdentity,
    dto: UpdatePlatformSettingsDto,
    meta: AdminRequestMeta,
  ): Promise<AdminSettings> {
    const [existing] = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.singleton, true))
      .limit(1);

    if (!existing) throw this.notSeeded();

    // Only the fields that actually differ — the same rule
    // AdminCategoriesService.update() applies, for the same reason: PATCHing a
    // setting with the value it already holds would otherwise write an audit
    // row claiming a change that did not happen, and the history a reviewer
    // reads to answer "who paused the platform" would fill with noise.
    const changes: Partial<Record<EditableField, unknown>> = {};
    const before: Partial<Record<EditableField, unknown>> = {};

    for (const field of EDITABLE_FIELDS) {
      const next = (dto as Record<string, unknown>)[field];
      if (next === undefined) continue;

      const current = (existing as Record<string, unknown>)[field];
      if (next === current) continue;

      changes[field] = next;
      before[field] = current;
    }

    if (Object.keys(changes).length === 0) {
      throw new BadRequestException({
        code: 'NO_EFFECTIVE_CHANGE',
        message:
          'Every field in this request already holds the value you sent.',
      });
    }

    return db.transaction(async (tx) => {
      const [updated] = await tx
        .update(platformSettings)
        .set({
          ...(changes as Partial<typeof platformSettings.$inferInsert>),
          // Provenance for the console's "last changed by" line. The DURABLE
          // record is the audit row below — this column is SET NULL on the
          // admin's deletion, the audit row's actor snapshot is not.
          updatedBy: admin.userId,
          updatedAt: sql`now()`,
        })
        .where(eq(platformSettings.singleton, true))
        .returning();

      // ADR 0012: inside the mutating transaction, with `tx` passed, so the log
      // and the change succeed or fail together. `before`/`after` are scoped to
      // the changed fields, so the row reads as a diff rather than two full
      // copies of the settings object a human has to compare by eye.
      await this.auditService.record({
        admin,
        action: 'platform_setting.update',
        targetId: updated.id,
        // There is only ever one row, so its id says nothing a reader can use.
        // The label is what makes the entry legible in the Audit Logs table.
        targetLabel: 'App Settings',
        before,
        after: changes,
        meta,
        tx,
      });

      // The updater is, by definition, the admin making this request — so no
      // join is needed here, and `updatedByDeleted` cannot be true on this path.
      return this.toResponse(updated, { id: admin.userId, name: admin.name });
    });
  }

  private toResponse(
    row: PlatformSettingsRow,
    updatedByUser: { id: string; name: string } | null,
  ): AdminSettings {
    return {
      ...toPlatformConfig(row),
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: updatedByUser,
      /**
       * `updated_by` being null means one of two different things, and the
       * console needs to tell them apart: nobody has ever changed the settings,
       * or the person who did has had their account deleted (the FK is
       * ON DELETE SET NULL).
       *
       * `updated_at > created_at` separates them. The seed inserts the row with
       * both timestamps defaulted in one statement, so they are equal on an
       * untouched row, and it upserts with onConflictDoNothing so a re-seed
       * never moves `updated_at`. Every path that writes this table sets
       * `updated_at = now()` AND `updated_by`, so a row that has moved past its
       * creation time and still has a null actor can only have lost that actor
       * to a deletion.
       *
       * This is a derivation, not a stored fact, and it is the honest limit of
       * the frozen column set. The authoritative answer to "who changed this"
       * is the `platform_setting.update` audit row, which snapshots the actor's
       * name, email and role and survives their account being deleted.
       */
      updatedByDeleted:
        row.updatedBy === null &&
        row.updatedAt.getTime() > row.createdAt.getTime(),
    };
  }

  /**
   * Loud and actionable, the way every other master-data reader in this codebase
   * is ("did db:seed run?"). Note the deliberate asymmetry with the citizen
   * side: `getPlatformConfig()` falls back to the built-in defaults so a fresh
   * database still serves the mobile app, because a missing row cannot have
   * hidden an operator's intent. The console is the one surface that must not
   * paper over it — it is about to offer an edit form for a row that is not
   * there.
   */
  private notSeeded(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'PLATFORM_SETTINGS_NOT_SEEDED',
      message:
        'No platform_settings row exists — run `pnpm db:seed` to create it.',
    });
  }
}
