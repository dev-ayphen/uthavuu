/**
 * The bridge between "the limiter works" and "the limiter is applied to the
 * endpoints the product owner asked about".
 *
 * rate-limit.http.spec.ts proves the machinery works on real HTTP, but it does
 * so against stand-in controllers, because the real AppModule cannot boot under
 * this package's CommonJS Jest transform. This suite closes the other half: it
 * reads the metadata the REAL decorators left on the REAL handlers, and feeds it
 * through the REAL policyFor() — so a decorator that is missing, misspelled or
 * silently deleted fails here.
 *
 * The library mock is the same one admin-module-guard.spec.ts needs and for the
 * same reason: these controllers import @thallesp/nestjs-better-auth, which is
 * ESM-only.
 */
/**
 * `unbound-method` is disabled for the file, not silenced case by case — the
 * same call admin-report-photos.controller.spec.ts makes, for the same reason.
 * This suite reads metadata off each handler FUNCTION and never calls one;
 * binding them would inspect a different object than the one Nest passes.
 */
/* eslint-disable @typescript-eslint/unbound-method */

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AllowAnonymous: () => () => undefined,
  OptionalAuth: () => () => undefined,
  Session: () => () => undefined,
  AuthModule: { forRoot: () => ({ module: class {} }) },
}));

import { AppController } from '../app.controller';
import { CommentsController } from '../comments/comments.controller';
import { MissionsController } from '../missions/missions.controller';
import { ReportsController } from '../reports/reports.controller';
import { SupportController } from '../support/support.controller';
import { UploadsController } from '../uploads/uploads.controller';
import { ReportPhotoController } from '../uploads/report-photo.controller';
import {
  RATE_LIMIT_EXEMPT_METADATA,
  RATE_LIMIT_POLICY_METADATA,
} from './rate-limit.decorator';
import { policyFor } from './rate-limit-policy';
import type { RateLimitPolicy } from './rate-limit-config';

type Handler = (...args: never[]) => unknown;

const declaredPolicy = (handler: Handler): RateLimitPolicy | undefined =>
  Reflect.getMetadata(RATE_LIMIT_POLICY_METADATA, handler) as
    RateLimitPolicy | undefined;

const isExempt = (handler: Handler): boolean =>
  Reflect.getMetadata(RATE_LIMIT_EXEMPT_METADATA, handler) === true;

describe('the endpoints the owner named', () => {
  it.each([
    ['POST /reports', ReportsController.prototype.create, 'report-create'],
    [
      'POST /reports/:id/messages (Mission Chat)',
      MissionsController.prototype.send,
      'mission-chat',
    ],
    [
      'POST /reports/:id/comments',
      CommentsController.prototype.create,
      'comment',
    ],
    [
      'POST /uploads',
      UploadsController.prototype.uploadAvatar,
      'avatar-upload',
    ],
    [
      'POST /support/tickets',
      SupportController.prototype.create,
      'support-ticket',
    ],
    [
      'POST /support/tickets/:id/messages',
      SupportController.prototype.addMessage,
      'support-ticket',
    ],
  ] as ReadonlyArray<readonly [string, Handler, RateLimitPolicy]>)(
    '%s declares the %s policy',
    (_label, handler, expected) => {
      expect(declaredPolicy(handler)).toBe(expected);
      // ...and the real decision function agrees, so this is not just an
      // assertion that a string was written somewhere.
      expect(
        policyFor({
          method: 'POST',
          isAdminRoute: false,
          declaredPolicy: declaredPolicy(handler),
        }),
      ).toBe(expected);
    },
  );
});

describe('POST /uploads/report-photo', () => {
  /**
   * The one route the owner named that was ALREADY limited, and it stays that
   * way rather than being re-implemented.
   *
   * It deliberately carries no @RateLimit() decorator. Its spend ceiling — 20
   * per 15 minutes, keyed on the session user id — lives in
   * uploads/upload-rate-limiter.ts and is enforced inside the handler, which is
   * where it has always been. Giving it a bespoke guard policy as well would
   * have meant two overlapping budgets for the same thing.
   *
   * What it gains from this change is the generic `write` burst valve in front
   * of it (asserted below) and, for the first time, a `Retry-After` header on
   * the 429 it already returned.
   */
  it('has no declared policy, so it falls back to the `write` default', () => {
    const handler = ReportPhotoController.prototype.upload;
    expect(declaredPolicy(handler)).toBeUndefined();
    expect(isExempt(handler)).toBe(false);
    expect(
      policyFor({
        method: 'POST',
        isAdminRoute: false,
        declaredPolicy: undefined,
      }),
    ).toBe('write');
  });
});

describe('the health endpoint', () => {
  it('is the ONLY exempt route', () => {
    // A limiter on a liveness probe can restart a healthy container by itself.
    expect(isExempt(AppController.prototype.getHello)).toBe(true);
    expect(
      policyFor({ method: 'GET', isAdminRoute: false, exempt: true }),
    ).toBe(null);
  });

  it.each([
    ['ReportsController.create', ReportsController.prototype.create],
    ['MissionsController.send', MissionsController.prototype.send],
    [
      'UploadsController.uploadAvatar',
      UploadsController.prototype.uploadAvatar,
    ],
    ['ReportPhotoController.upload', ReportPhotoController.prototype.upload],
    ['SupportController.create', SupportController.prototype.create],
    ['CommentsController.create', CommentsController.prototype.create],
  ] as ReadonlyArray<readonly [string, Handler]>)(
    '%s is not exempt',
    (_label, handler) => {
      expect(isExempt(handler)).toBe(false);
    },
  );
});

describe('admin route classification', () => {
  /**
   * The guard classifies /admin/* off @Controller() path metadata rather than
   * the request URL, so ~40 admin mutations across 16 controllers are covered
   * with no decorator anyone can forget.
   *
   * THE PREMISE THAT RESTS ON — "every controller AdminModule registers is
   * mounted under `admin`" — is already asserted by admin-module-guard.spec.ts
   * ("every controller lives under the /admin path prefix"), which walks the
   * real module's controller list. It is deliberately NOT re-asserted here:
   * importing AdminModule into this suite drags in the whole admin service graph
   * and its database connections, which is a slow, hanging test that proves
   * something another suite already proves. MaintenanceGuard leans on exactly
   * the same guarantee for exactly the same reason.
   *
   * What is left for this file is the mapping from that fact to a policy.
   */
  it('sends every admin mutation to admin-write and every read to admin-read', () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(policyFor({ method, isAdminRoute: true })).toBe('admin-write');
    }
    expect(policyFor({ method: 'GET', isAdminRoute: true })).toBe('admin-read');
  });

  it('does not let an admin policy leak onto a citizen route', () => {
    expect(policyFor({ method: 'POST', isAdminRoute: false })).toBe('write');
    expect(policyFor({ method: 'GET', isAdminRoute: false })).toBe('read');
  });
});
