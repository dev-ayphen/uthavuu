import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { account, session, user } from '../db/schema/auth-schema';
import { adminRoles, adminUsers } from '../db/schema/admin-schema';
import {
  userAccountStatus,
  userStatuses,
} from '../db/schema/user-status-schema';
import {
  ACTIVE_STATUS_KEY,
  SUSPENDED_STATUS_KEY,
} from '../account-status/account-status';
import { SUPER_ADMIN_ROLE_KEY } from '@uthavu/libs-common';
import { AdminAuditService } from './admin-audit.service';
import { ADMIN_CREDENTIALS } from './admin-credentials';
import type { AdminCredentials } from './admin-credentials';
import type { AdminIdentity } from './admin-rbac';
import type { AdminRequestMeta } from './admin-request-meta';
import type { CreateAdminAccountDto } from './dto/create-admin-account.dto';
import type {
  UpdateAdminAccountDto,
  UpdateMyAdminProfileDto,
} from './dto/update-admin-account.dto';
import type {
  ChangeMyPasswordDto,
  ResetAdminPasswordDto,
} from './dto/admin-account-password.dto';
import type {
  ReactivateAdminAccountDto,
  SuspendAdminAccountDto,
} from './dto/suspend-admin-account.dto';

/** Drizzle executor — the `db` singleton or a transaction handle. */
type Executor = Pick<
  typeof db,
  'select' | 'selectDistinctOn' | 'insert' | 'update' | 'delete'
>;

// SUPER_ADMIN_ROLE_KEY is imported from @uthavu/libs-common — the console
// compares against the same string to decide what to render, so it is contract,
// not a local detail.
const CREDENTIAL_PROVIDER_ID = 'credential';

/** What every mutating route on this surface hands back. */
export interface AdminAccountDetail {
  userId: string;
  name: string;
  email: string;
  role: { key: string; label: string };
  /** `active` | `suspended`, from `user_account_status` (ADR 0011). */
  status: { key: string; label: string };
  /** When admin access was granted — `admin_users.created_at`, not the user's. */
  createdAt: string;
  /** Most recent `session.created_at`; null if they have never signed in. */
  lastLoginAt: string | null;
  isSelf: boolean;
  isLastSuperAdmin: boolean;
}

/**
 * Platform -> Admins. The console's management of its OWN operators.
 *
 * docs/webadmin/09-admins-and-audit.md gap #2 is the reason this file is
 * paranoid: in the prototype "an Ops Moderator — or an unauthenticated visitor —
 * can create a Super Admin", because the Admins tab had no role guard at all.
 * Every route here is `platform:manage` except the self-service password
 * change, and every destructive one goes through the three checks below.
 *
 * ── The three safety rules, and why they are here and not in the console ──
 *
 *  1. THE LAST SUPER ADMIN CANNOT BE SUSPENDED, REVOKED OR DEMOTED. A console
 *     that can lock every administrator out of itself is unrecoverable without
 *     direct database access — there is no password-reset email in this product
 *     (ADR 0003) and no self-service path back in. The count is taken from the
 *     database inside the same transaction as the mutation, behind a row lock,
 *     so two admins doing it at once cannot both pass the check.
 *  2. AN ADMIN CANNOT ACT ON THEMSELVES. Same failure, cheaper: one person
 *     removing their own access is the single most likely way this goes wrong.
 *  3. ONLY `platform:manage` MAY ACT ON ANOTHER ADMIN, and the one route an
 *     admin may aim at themselves is `POST /admin/me/change-password`, which
 *     requires the current password. Rule 3's first half is the route decorator
 *     (admin-accounts.controller.ts); its second half is `assertNotSelf` below.
 *
 * ── What this service deliberately does NOT do ──
 *
 * No schema of its own. Suspension reuses `user_account_status` because an
 * admin IS a `user` and ADR 0011's two enforcement points already cover them;
 * last-login is derived from `session`; roles already live in
 * `admin_users.role_id`. A parallel admin-status table would give "suspended"
 * two meanings and one of them would drift.
 *
 * No password handling of its own either — everything goes through
 * AdminCredentials, which is Better Auth's own hasher. No plaintext is ever
 * stored, logged, returned, or written to an audit row.
 */
@Injectable()
export class AdminAccountsService {
  constructor(
    private readonly auditService: AdminAuditService,
    @Inject(ADMIN_CREDENTIALS)
    private readonly credentials: AdminCredentials,
  ) {}

  /**
   * `coalesce(status, 'active')` — absence of a `user_account_status` row IS
   * active (db/schema/user-status-schema.ts). Same expression, same reason, as
   * AdminUsersService's.
   */
  private readonly statusKeySql = sql<string>`coalesce(${userStatuses.key}, ${ACTIVE_STATUS_KEY})`;

  /**
   * `user_statuses`, memoised. Master data is immutable between deploys, and a
   * miss always falls through to a query — so the memo can be stale-empty,
   * never stale-wrong. Same property AdminAuditService's catalogue memo has.
   */
  private statusCache: Map<string, { id: string; label: string }> | null = null;

  // ──────────────────────────────────────────────────────────────────────────
  // Reads
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /admin/admins — the whole roster, in the SAME shape as the detail
   * route.
   *
   * One projection for both, deliberately. The list and the detail disagreeing
   * is not cosmetic: without `status` on a row the console cannot know whether
   * to offer Suspend or Reactivate, and defaulting to one of them means the
   * other is never reachable from the table. A second copy of the query is what
   * let them drift in the first place.
   *
   * Not paginated: the roster is the handful of people who run the product, and
   * a page-size cap on a list that will never reach 100 rows would only add a
   * contract the console has to honour.
   */
  async list(admin: AdminIdentity): Promise<AdminAccountDetail[]> {
    return this.loadAccounts(admin, db);
  }

  /** GET /admin/admins/:id */
  async findOne(
    admin: AdminIdentity,
    userId: string,
  ): Promise<AdminAccountDetail> {
    const [detail] = await this.loadAccounts(admin, db, userId);

    if (!detail) {
      throw new NotFoundException({
        code: 'ADMIN_NOT_FOUND',
        message: 'No admin account with that id.',
      });
    }

    return detail;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Provisioning
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * POST /admin/admins — create a `user`, a credential `account` and an
   * `admin_users` row together.
   *
   * The three-part shape is db/seed-admins.ts's, because it has to be: Better
   * Auth finds a credential by (issuer, accountId, providerId), and an admin is
   * an `admin_users` row rather than a flag on `user`. The seed provisions the
   * FIRST admins; this provisions every one after. Neither is self-service —
   * `disableSignUp` is set in auth.ts precisely so there is no third way.
   *
   * An existing `user` with this email is REFUSED rather than promoted. Citizen
   * accounts are created by phone+OTP with a synthetic
   * `@phone.uthavu.local` address, so a real collision means either an existing
   * admin or a hand-made row — and quietly attaching console credentials to an
   * account somebody already signs into is not something an operator asked for.
   */
  async create(
    admin: AdminIdentity,
    dto: CreateAdminAccountDto,
    meta?: AdminRequestMeta,
  ): Promise<AdminAccountDetail> {
    const role = await this.requireRole(dto.roleKey);

    // Hashed BEFORE the transaction opens: scrypt is deliberately slow, and
    // holding a transaction (and a pooled connection) open across it would
    // serialise unrelated writes behind a CPU-bound wait for no benefit. The
    // plaintext never leaves this method.
    const passwordHash = await this.credentials.hash(dto.password);
    const issuer = await this.credentials.issuer();

    const userId = uuidv7();

    await db.transaction(async (tx) => {
      await this.assertEmailAvailable(tx, dto.email);

      await tx.insert(user).values({
        id: userId,
        name: dto.name,
        email: dto.email,
        // No verification email can be sent — this project has no email
        // provider (ADR 0003). A staff account is verified by virtue of an
        // admin having provisioned it, exactly as the seed treats its own.
        emailVerified: true,
        // Deliberately no phoneNumber: an admin account is not a citizen
        // account and cannot be signed into from the mobile app, which
        // authenticates only by phone + OTP.
        profileCompletedAt: new Date(),
      });

      await tx.insert(account).values({
        id: uuidv7(),
        userId,
        providerId: CREDENTIAL_PROVIDER_ID,
        issuer,
        accountId: userId,
        password: passwordHash,
        updatedAt: new Date(),
      });

      await tx.insert(adminUsers).values({ userId, roleId: role.id });

      await this.auditService.record({
        admin,
        action: 'admin.create',
        targetId: userId,
        targetLabel: dto.name,
        before: null,
        // No password, not even a hash. An audit row is read by people; a hash
        // in one is offline-crackable material sitting in a table designed to
        // be widely readable by staff.
        after: { name: dto.name, email: dto.email, roleKey: role.key },
        meta,
        tx,
      });
    });

    return this.findOne(admin, userId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Editing
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * PATCH /admin/admins/:id — name, email and/or role.
   *
   * A role change writes `admin.role_change` and a profile change writes
   * `admin.update`; a PATCH that does both writes both, in one transaction.
   * They are separate catalogue entries because "who made this person a Super
   * Admin" is a different question from "who fixed the spelling of their name",
   * and a console filter has to be able to ask only the first.
   */
  async update(
    admin: AdminIdentity,
    userId: string,
    dto: UpdateAdminAccountDto,
    meta?: AdminRequestMeta,
  ): Promise<AdminAccountDetail> {
    const target = await this.requireAdminAccount(userId);
    this.assertNotSelf(admin, userId, 'edit your own admin account');

    const nextRole =
      dto.roleKey !== undefined && dto.roleKey !== target.roleKey
        ? await this.requireRole(dto.roleKey)
        : null;

    const profilePatch: { name?: string; email?: string } = {};
    if (dto.name !== undefined && dto.name !== target.name) {
      profilePatch.name = dto.name;
    }
    if (dto.email !== undefined && dto.email !== target.email) {
      profilePatch.email = dto.email;
    }
    const profileChanged = Object.keys(profilePatch).length > 0;

    await db.transaction(async (tx) => {
      if (nextRole) {
        // Demotion is one of the three ways to lose the last Super Admin.
        // Locked and counted inside the transaction, like suspend and revoke.
        await this.lockSuperAdminRoster(tx);
        await this.assertNotLastSuperAdmin(tx, userId, 'demoted');
      }

      if (profilePatch.email !== undefined) {
        await this.assertEmailAvailable(tx, profilePatch.email, userId);
      }

      if (profileChanged) {
        // `user.updatedAt` carries $onUpdate in auth-schema.ts, so Drizzle
        // stamps it — setting it here would only be a second, drifting copy.
        await tx.update(user).set(profilePatch).where(eq(user.id, userId));

        await this.auditService.record({
          admin,
          action: 'admin.update',
          targetId: userId,
          targetLabel: profilePatch.name ?? target.name,
          before: { name: target.name, email: target.email },
          after: {
            name: profilePatch.name ?? target.name,
            email: profilePatch.email ?? target.email,
          },
          meta,
          tx,
        });
      }

      if (nextRole) {
        await tx
          .update(adminUsers)
          .set({ roleId: nextRole.id, updatedAt: sql`now()` })
          .where(eq(adminUsers.userId, userId));

        await this.auditService.record({
          admin,
          action: 'admin.role_change',
          targetId: userId,
          targetLabel: profilePatch.name ?? target.name,
          before: { roleKey: target.roleKey },
          after: { roleKey: nextRole.key },
          meta,
          tx,
        });
      }
    });

    return this.findOne(admin, userId);
  }

  /**
   * PATCH /admin/me — an admin editing their own name and email. ANY admin,
   * including Ops.
   *
   * The counterpart to `assertNotSelf` on the `:id` route rather than a hole in
   * it. The owner's permission table grants "edit own profile" to both roles;
   * what neither role may do is change their own ROLE, and this route cannot —
   * `UpdateMyAdminProfileDto` has no `roleKey` field, so self-promotion is
   * unrepresentable rather than merely refused.
   *
   * The account is identified from the guard-resolved identity, never from the
   * body, so there is no id a caller could substitute to aim it elsewhere.
   */
  async updateMyProfile(
    admin: AdminIdentity,
    dto: UpdateMyAdminProfileDto,
    meta?: AdminRequestMeta,
  ): Promise<AdminAccountDetail> {
    const target = await this.requireAdminAccount(admin.userId);

    const patch: { name?: string; email?: string } = {};
    if (dto.name !== undefined && dto.name !== target.name) {
      patch.name = dto.name;
    }
    if (dto.email !== undefined && dto.email !== target.email) {
      patch.email = dto.email;
    }

    // A PATCH that changes nothing writes nothing — an audit row claiming this
    // account was edited would be false, in the one table that must not hold
    // anything false.
    if (Object.keys(patch).length === 0) {
      return this.findOne(admin, admin.userId);
    }

    await db.transaction(async (tx) => {
      if (patch.email !== undefined) {
        await this.assertEmailAvailable(tx, patch.email, admin.userId);
      }

      await tx.update(user).set(patch).where(eq(user.id, admin.userId));

      await this.auditService.record({
        admin,
        action: 'admin.update',
        targetId: admin.userId,
        targetLabel: patch.name ?? target.name,
        before: { name: target.name, email: target.email },
        after: {
          name: patch.name ?? target.name,
          email: patch.email ?? target.email,
        },
        meta,
        tx,
      });
    });

    return this.findOne(admin, admin.userId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Credentials
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * POST /admin/admins/:id/reset-password — 204.
   *
   * The Super Admin path: no `currentPassword`, because a Super Admin does not
   * know somebody else's and asking would only mean asking the locked-out
   * person for the secret they lost. See the DTO for the full argument.
   *
   * SESSIONS ARE NOT REVOKED HERE, and that is a real trade rather than an
   * oversight. Revoking would mean deleting the target's `session` rows — and
   * `lastLoginAt` on this very surface is derived from `session.created_at`, so
   * deleting them erases the directory's last-login history for that person.
   * Wanting both means adding a real `last_login_at` column first; until then
   * the honest position is that a reset changes the credential, not the live
   * session. (Suspension is the lever that stops a live session, and ADR 0011
   * keeps the row for its own reason: so the guard can answer a specific 403
   * instead of a bare 401.)
   */
  async resetPassword(
    admin: AdminIdentity,
    userId: string,
    dto: ResetAdminPasswordDto,
    meta?: AdminRequestMeta,
  ): Promise<void> {
    const target = await this.requireAdminAccount(userId);
    this.assertNotSelf(
      admin,
      userId,
      'reset your own password — use POST /admin/me/change-password',
    );

    const passwordHash = await this.credentials.hash(dto.newPassword);
    const issuer = await this.credentials.issuer();

    await db.transaction(async (tx) => {
      const [credential] = await tx
        .select({ id: account.id })
        .from(account)
        .where(
          and(
            eq(account.userId, userId),
            eq(account.providerId, CREDENTIAL_PROVIDER_ID),
          ),
        );

      if (credential) {
        await tx
          .update(account)
          .set({ password: passwordHash })
          .where(eq(account.id, credential.id));
      } else {
        // An admin row whose user has no credential account — possible if the
        // `user` was created another way. Giving them one is the point of the
        // route, so create rather than 404 on a technicality.
        await tx.insert(account).values({
          id: uuidv7(),
          userId,
          providerId: CREDENTIAL_PROVIDER_ID,
          issuer,
          accountId: userId,
          password: passwordHash,
          updatedAt: new Date(),
        });
      }

      await this.auditService.record({
        admin,
        action: 'admin.password_reset',
        targetId: userId,
        targetLabel: target.name,
        // BOTH NULL, DELIBERATELY. The recordable fact is that a reset
        // happened — actor, target, timestamp, all of which the row already
        // carries. Neither the old nor the new value, nor their hashes, nor
        // their lengths, belongs in a table staff read.
        before: null,
        after: null,
        meta,
        tx,
      });
    });
  }

  /**
   * POST /admin/me/change-password — 204. The only route any admin may aim at
   * their own account, and the only one an Ops Admin can call on this surface.
   *
   * `currentPassword` is verified with Better Auth's own verifier before
   * anything is written, so an unattended session cannot be turned into
   * permanent ownership of the account.
   *
   * Audited as `admin.password_reset` with actor == target, which is what
   * distinguishes a self-service change from a Super Admin's reset in the log.
   */
  async changeMyPassword(
    admin: AdminIdentity,
    dto: ChangeMyPasswordDto,
    meta?: AdminRequestMeta,
  ): Promise<void> {
    const [credential] = await db
      .select({ id: account.id, password: account.password })
      .from(account)
      .where(
        and(
          eq(account.userId, admin.userId),
          eq(account.providerId, CREDENTIAL_PROVIDER_ID),
        ),
      );

    if (!credential?.password) {
      throw new ConflictException({
        code: 'NO_PASSWORD_CREDENTIAL',
        message: 'This admin account does not sign in with a password.',
      });
    }

    const matches = await this.credentials.verify({
      hash: credential.password,
      password: dto.currentPassword,
    });

    if (!matches) {
      // 403, not 401. A 401 is what the console shows when a session dies, and
      // it would bounce the admin to the login screen mid-form rather than
      // telling them they mistyped.
      throw new ForbiddenException({
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'The current password is incorrect.',
      });
    }

    const passwordHash = await this.credentials.hash(dto.newPassword);

    await db.transaction(async (tx) => {
      await tx
        .update(account)
        .set({ password: passwordHash })
        .where(eq(account.id, credential.id));

      await this.auditService.record({
        admin,
        action: 'admin.password_reset',
        targetId: admin.userId,
        targetLabel: admin.name,
        before: null,
        after: null,
        meta,
        tx,
      });
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Access
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * POST /admin/admins/:id/suspend — block this admin's login and every
   * authenticated request they make.
   *
   * Pure ADR 0011: a row in `user_account_status`, nothing else touched. Their
   * moderation history, their audit entries and anything they created stay
   * exactly where they are — the audit trail in particular must survive its
   * author being blocked, or suspension becomes a way to obscure what somebody
   * did.
   */
  async suspend(
    admin: AdminIdentity,
    userId: string,
    dto: SuspendAdminAccountDto,
    meta?: AdminRequestMeta,
  ): Promise<AdminAccountDetail> {
    const target = await this.requireAdminAccount(userId);
    this.assertNotSelf(admin, userId, 'suspend your own admin account');

    if (target.statusKey === SUSPENDED_STATUS_KEY) {
      throw new ConflictException({
        code: 'ADMIN_ALREADY_SUSPENDED',
        message: 'This admin account is already suspended.',
      });
    }

    const suspended = await this.requireStatus(SUSPENDED_STATUS_KEY);
    const suspendedAt = new Date();
    const reason = dto.reason ?? null;

    await db.transaction(async (tx) => {
      await this.lockSuperAdminRoster(tx);
      await this.assertNotLastSuperAdmin(tx, userId, 'suspended');

      // Upsert: absence of a row means active, so a first-ever suspension
      // inserts and a re-suspension updates what a reactivate left behind.
      await tx
        .insert(userAccountStatus)
        .values({
          userId,
          statusId: suspended.id,
          reason,
          suspendedAt,
          suspendedBy: admin.userId,
        })
        .onConflictDoUpdate({
          target: userAccountStatus.userId,
          set: {
            statusId: suspended.id,
            reason,
            suspendedAt,
            suspendedBy: admin.userId,
            updatedAt: sql`now()`,
          },
        });

      await this.auditService.record({
        admin,
        action: 'admin.suspend',
        targetId: userId,
        targetLabel: target.name,
        before: { status: target.statusKey, roleKey: target.roleKey },
        after: {
          status: SUSPENDED_STATUS_KEY,
          suspendedAt: suspendedAt.toISOString(),
        },
        reason,
        meta,
        tx,
      });
    });

    return this.findOne(admin, userId);
  }

  /**
   * POST /admin/admins/:id/reactivate — lift a suspension.
   *
   * No self-check and no last-super-admin check, both for the same reason:
   * this only ever ADDS a way into the console. (A self-reactivate is
   * unreachable anyway — a suspended admin cannot get a session to call it
   * with.) Undoing a mistake must never be harder than making it, which is the
   * position AdminUsersService.reactivate already takes.
   */
  async reactivate(
    admin: AdminIdentity,
    userId: string,
    dto: ReactivateAdminAccountDto,
    meta?: AdminRequestMeta,
  ): Promise<AdminAccountDetail> {
    const target = await this.requireAdminAccount(userId);

    if (target.statusKey !== SUSPENDED_STATUS_KEY) {
      throw new ConflictException({
        code: 'ADMIN_NOT_SUSPENDED',
        message: 'This admin account is not suspended.',
      });
    }

    const active = await this.requireStatus(ACTIVE_STATUS_KEY);

    await db.transaction(async (tx) => {
      await tx
        .update(userAccountStatus)
        .set({
          statusId: active.id,
          reason: null,
          suspendedAt: null,
          suspendedBy: null,
          updatedAt: sql`now()`,
        })
        .where(eq(userAccountStatus.userId, userId));

      await this.auditService.record({
        admin,
        action: 'admin.reactivate',
        targetId: userId,
        targetLabel: target.name,
        before: {
          status: SUSPENDED_STATUS_KEY,
          reason: target.suspensionReason,
        },
        after: { status: ACTIVE_STATUS_KEY },
        reason: dto.reason ?? null,
        meta,
        tx,
      });
    });

    return this.findOne(admin, userId);
  }

  /**
   * DELETE /admin/admins/:id — 204.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ THIS REVOKES ADMIN ACCESS. IT DOES NOT DELETE THE USER.              │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * It removes the `admin_users` row and nothing else. The person keeps their
   * `user` account, their reports, their missions, their comments and their
   * impact stories, and can still use the mobile app like anyone else.
   *
   * DO NOT "FIX" THIS INTO A USER DELETE. Deleting the `user` row cascades
   * through community content and is a genuinely destructive, different
   * operation that already exists and is owned by
   * `UsersService.deleteAccount()` (users.service.ts), with its own carefully
   * chosen SET NULL / CASCADE policy. Two operations, two blast radii; this is
   * the small one, on purpose. `admin_users` CASCADEs from `user` precisely so
   * the big one implies the small one and never the reverse
   * (db/schema/admin-schema.ts).
   *
   * Their audit entries survive too — `admin_audit_logs.actor_user_id` is SET
   * NULL and the actor's name, email and role were snapshotted at write time
   * (ADR 0012), so revoking somebody's access never erases what they did.
   */
  async revoke(
    admin: AdminIdentity,
    userId: string,
    meta?: AdminRequestMeta,
  ): Promise<void> {
    const target = await this.requireAdminAccount(userId);
    this.assertNotSelf(admin, userId, 'revoke your own admin access');

    await db.transaction(async (tx) => {
      await this.lockSuperAdminRoster(tx);
      await this.assertNotLastSuperAdmin(tx, userId, 'revoked');

      await tx.delete(adminUsers).where(eq(adminUsers.userId, userId));

      await this.auditService.record({
        admin,
        action: 'admin.revoke',
        targetId: userId,
        targetLabel: target.name,
        before: {
          roleKey: target.roleKey,
          name: target.name,
          email: target.email,
        },
        // null, because there is no admin record left to describe. The user
        // still exists — see the box above.
        after: null,
        meta,
        tx,
      });
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // The safety rules
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Rule 2. Throws unless the actor and the target are different people.
   *
   * Cheap and unconditional: it does not care how many other Super Admins
   * exist, because "I removed my own access" is a mistake nobody should be able
   * to make in one click even when it is technically recoverable by a colleague.
   */
  private assertNotSelf(
    admin: AdminIdentity,
    userId: string,
    what: string,
  ): void {
    if (admin.userId === userId) {
      throw new ForbiddenException({
        code: 'CANNOT_MODIFY_SELF',
        message: `You cannot ${what}. Ask another Super Admin.`,
      });
    }
  }

  /**
   * Rule 1. Throws if this mutation would leave the console with nobody able to
   * sign in as a Super Admin.
   *
   * "Able to sign in" rather than "exists" is the load-bearing part. A
   * suspended Super Admin cannot log in (ADR 0011), so counting rows would let
   * you suspend the one working Super Admin while a suspended one sits in the
   * table looking like a spare — and lock the console permanently. The set
   * below therefore excludes suspended accounts, which also means revoking or
   * demoting an already-suspended Super Admin is correctly allowed: they were
   * not a way in to begin with.
   *
   * MUST be called inside the mutating transaction, after
   * `lockSuperAdminRoster()`. The lock is what turns this from a check into a
   * guarantee: without it, two admins suspending two different Super Admins
   * simultaneously both read "2" and both proceed, leaving zero.
   */
  private async assertNotLastSuperAdmin(
    tx: Executor,
    userId: string,
    verb: string,
  ): Promise<void> {
    const signInCapable = await this.signInCapableSuperAdmins(tx);

    if (signInCapable.length === 1 && signInCapable[0] === userId) {
      throw new ConflictException({
        code: 'LAST_SUPER_ADMIN',
        message: `The last Super Admin cannot be ${verb}. Promote another admin first.`,
      });
    }
  }

  /** Super admins who are not suspended — i.e. who can actually get back in. */
  private async signInCapableSuperAdmins(tx: Executor): Promise<string[]> {
    const rows = await tx
      .select({ userId: adminUsers.userId })
      .from(adminUsers)
      .innerJoin(adminRoles, eq(adminUsers.roleId, adminRoles.id))
      .leftJoin(
        userAccountStatus,
        eq(userAccountStatus.userId, adminUsers.userId),
      )
      .leftJoin(userStatuses, eq(userAccountStatus.statusId, userStatuses.id))
      .where(
        and(
          eq(adminRoles.key, SUPER_ADMIN_ROLE_KEY),
          ne(this.statusKeySql, SUSPENDED_STATUS_KEY),
        ),
      );

    return rows.map((row) => row.userId);
  }

  /**
   * `SELECT ... FOR UPDATE` over the Super Admin roster.
   *
   * Row locks on `admin_users`, held to the end of the transaction, so any
   * other transaction about to change the roster waits and then re-reads it.
   * Suspension writes to `user_account_status` rather than here, but every path
   * that can reduce the Super Admin count takes this lock first, which is what
   * serialises them against each other.
   *
   * The subquery resolves `super_admin` to its role id without joining
   * `admin_roles` into the locked statement — Postgres would otherwise take row
   * locks on a lookup table every admin request reads.
   */
  private async lockSuperAdminRoster(tx: Executor): Promise<void> {
    await tx
      .select({ userId: adminUsers.userId })
      .from(adminUsers)
      .where(
        inArray(
          adminUsers.roleId,
          db
            .select({ id: adminRoles.id })
            .from(adminRoles)
            .where(eq(adminRoles.key, SUPER_ADMIN_ROLE_KEY)),
        ),
      )
      .for('update');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Shared lookups
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * The target of every mutating route, or a 404.
   *
   * Keyed on `admin_users`, so a perfectly real citizen id is a 404 here rather
   * than a 200 describing a non-admin. "Not an admin" and "no such admin" are
   * the same fact on this surface.
   */
  private async requireAdminAccount(userId: string) {
    const [row] = await db
      .select({
        userId: adminUsers.userId,
        name: user.name,
        email: user.email,
        roleKey: adminRoles.key,
        statusKey: this.statusKeySql,
        suspensionReason: userAccountStatus.reason,
      })
      .from(adminUsers)
      .innerJoin(user, eq(adminUsers.userId, user.id))
      .innerJoin(adminRoles, eq(adminUsers.roleId, adminRoles.id))
      .leftJoin(
        userAccountStatus,
        eq(userAccountStatus.userId, adminUsers.userId),
      )
      .leftJoin(userStatuses, eq(userAccountStatus.statusId, userStatuses.id))
      .where(eq(adminUsers.userId, userId));

    if (!row) {
      throw new NotFoundException({
        code: 'ADMIN_NOT_FOUND',
        message: 'No admin account with that id.',
      });
    }

    return row;
  }

  /**
   * The ONE projection behind both `list()` and `findOne()`.
   *
   * Pass a `userId` for one row, omit it for the roster. Writing it once is the
   * point: the two endpoints previously came from different queries and
   * returned different fields, and the console cannot render a working Suspend
   * / Reactivate menu off a row that is missing `status`.
   */
  private async loadAccounts(
    admin: AdminIdentity,
    tx: Executor,
    userId?: string,
  ): Promise<AdminAccountDetail[]> {
    const rows = await tx
      .select({
        userId: adminUsers.userId,
        name: user.name,
        email: user.email,
        roleKey: adminRoles.key,
        roleLabel: adminRoles.label,
        // admin_users.created_at — when console ACCESS was granted, which is
        // the date this screen is about. `user.created_at` would be when the
        // person first existed, and for a promoted account the two differ.
        createdAt: adminUsers.createdAt,
        statusKey: this.statusKeySql,
        statusLabel: userStatuses.label,
      })
      .from(adminUsers)
      .innerJoin(user, eq(adminUsers.userId, user.id))
      .innerJoin(adminRoles, eq(adminUsers.roleId, adminRoles.id))
      .leftJoin(
        userAccountStatus,
        eq(userAccountStatus.userId, adminUsers.userId),
      )
      .leftJoin(userStatuses, eq(userAccountStatus.statusId, userStatuses.id))
      .where(userId === undefined ? undefined : eq(adminUsers.userId, userId))
      .orderBy(asc(adminRoles.key), asc(user.email));

    if (rows.length === 0) return [];

    const [signInCapable, lastLogins, statuses] = await Promise.all([
      this.signInCapableSuperAdmins(tx),
      this.lastLoginsFor(
        tx,
        rows.map((row) => row.userId),
      ),
      this.statuses(),
    ]);

    return rows.map((row) => {
      const lastLoginAt = lastLogins.get(row.userId) ?? null;
      // The join has no label when there is no status row, because there is no
      // row — the label for the implied `active` comes from the lookup table
      // rather than a string typed here.
      const statusLabel = row.statusLabel ?? statuses.get(row.statusKey)?.label;

      if (statusLabel === undefined) {
        throw new Error(
          `user_statuses row missing for key "${row.statusKey}" — did db:seed run?`,
        );
      }

      return {
        userId: row.userId,
        name: row.name,
        email: row.email,
        role: { key: row.roleKey, label: row.roleLabel },
        status: { key: row.statusKey, label: statusLabel },
        createdAt: row.createdAt.toISOString(),
        lastLoginAt: lastLoginAt ? lastLoginAt.toISOString() : null,
        isSelf: row.userId === admin.userId,
        // Drives the console's disabled state for suspend / revoke / demote,
        // and it is computed from the same set those three refuse on — so the
        // button being enabled and the request succeeding cannot disagree.
        isLastSuperAdmin:
          signInCapable.length === 1 && signInCapable[0] === row.userId,
      };
    });
  }

  /**
   * Last sign-in per admin, derived rather than stored.
   *
   * Better Auth writes a `session` row on every successful sign-in, so the most
   * recent one already answers the question. A `last_login_at` column would be
   * a second copy of a fact the database already has, kept correct by
   * remembering to write it — and it would need a migration, which this feature
   * deliberately does not take.
   *
   * SELECTING THE COLUMN, NOT `max()` IN RAW `sql`, and that is not a style
   * choice. `session.created_at` is `timestamp` WITHOUT time zone, and a raw
   * `sql` selection comes back from postgres-js undecoded
   * (`2026-09-02 08:21:24.49`) with no offset — `new Date()` would then read it
   * as LOCAL time and report a last login hours off. Selecting the column runs
   * Drizzle's own decoder, which is the thing that knows a naive timestamp in
   * this schema means UTC.
   *
   * `distinct on` rather than a row per session: an admin who has signed in
   * daily for a year has hundreds of rows and this needs exactly one of them.
   */
  private async lastLoginsFor(
    tx: Executor,
    userIds: string[],
  ): Promise<Map<string, Date>> {
    if (userIds.length === 0) return new Map();

    const rows = await tx
      .selectDistinctOn([session.userId], {
        userId: session.userId,
        createdAt: session.createdAt,
      })
      .from(session)
      .where(inArray(session.userId, userIds))
      .orderBy(session.userId, desc(session.createdAt));

    return new Map(rows.map((row) => [row.userId, row.createdAt]));
  }

  private async requireRole(roleKey: string) {
    const [row] = await db
      .select({ id: adminRoles.id, key: adminRoles.key })
      .from(adminRoles)
      .where(eq(adminRoles.key, roleKey));

    if (!row) {
      throw new Error(
        `admin_roles row missing for key "${roleKey}" — did db:seed run?`,
      );
    }

    return row;
  }

  private async requireStatus(statusKey: string) {
    const statuses = await this.statuses();
    const row = statuses.get(statusKey);

    if (!row) {
      throw new Error(
        `user_statuses row missing for key "${statusKey}" — did db:seed run?`,
      );
    }

    return row;
  }

  private async statuses(): Promise<
    Map<string, { id: string; label: string }>
  > {
    if (this.statusCache) return this.statusCache;

    const rows = await db
      .select({
        key: userStatuses.key,
        id: userStatuses.id,
        label: userStatuses.label,
      })
      .from(userStatuses);

    const map = new Map(
      rows.map((row) => [row.key, { id: row.id, label: row.label }]),
    );
    // Never memoise an empty result: on an unseeded database that would turn a
    // one-off "did db:seed run?" into a permanent one for the process.
    if (map.size > 0) this.statusCache = map;

    return map;
  }

  /**
   * Case-insensitive, because `user.email` is unique on the exact string.
   * Without this, `Admin@uthavu.org` alongside `admin@uthavu.org` is two rows
   * the database is happy with and one operator confused by — and only one of
   * them can sign in.
   */
  private async assertEmailAvailable(
    tx: Executor,
    email: string,
    exceptUserId?: string,
  ): Promise<void> {
    const [taken] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(sql`lower(${user.email})`, email.toLowerCase()));

    if (taken && taken.id !== exceptUserId) {
      throw new ConflictException({
        code: 'ADMIN_EMAIL_TAKEN',
        message: 'An account already exists with that email address.',
      });
    }
  }
}
