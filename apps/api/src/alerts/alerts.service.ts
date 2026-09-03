import { Injectable, Optional } from '@nestjs/common';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { alerts } from '../db/schema/alerts-schema';
import { user } from '../db/schema/auth-schema';
import { reports } from '../db/schema/reports-schema';
import { notRemoved } from '../reports/report-visibility';
import { defaultPushService, PushService } from '../push/push.service';
import {
  DEFAULT_ALERT_LOCALE,
  isAlertLocale,
  renderAlert,
  type AlertLocale,
  type AlertParams,
  type AlertType,
} from './alert-templates';

export type { AlertType, AlertParams } from './alert-templates';

@Injectable()
export class AlertsService {
  // WHY PUSH IS WIRED HERE, and not at the five places that raise alerts
  // (missions.service.ts:352/419/549, reports.service.ts:426,
  // admin-report-moderation.service.ts:122): this method is the ONE chokepoint
  // every alert row passes through. Wiring the call sites individually would
  // mean remembering to wire the next one, and an alert that silently never
  // pushes is invisible until someone in an emergency doesn't get notified.
  // Same reasoning auth.ts uses for hooking session.create.before rather than
  // each sign-in route.
  //
  // `@Optional()` with a default is what keeps that decision cheap: several
  // existing specs construct `new AlertsService()` by hand, and push must never
  // be the reason the API fails to start or a suite fails to run. DI supplies
  // the container instance in the running app (AlertsModule imports PushModule);
  // the memoised fallback covers hand construction.
  constructor(
    @Optional()
    private readonly pushService: PushService = defaultPushService(),
  ) {}

  // Callers pass structured `params`, never prose. The English rendering is
  // stored alongside them so the row stays self-describing and older clients
  // still have something to show; the mobile app re-renders from `type` +
  // `params` in the user's current language. See alert-templates.ts.
  async create(
    userId: string,
    type: AlertType,
    params: AlertParams,
    reportId?: string,
  ): Promise<void> {
    const { title, body } = renderAlert(type, params, DEFAULT_ALERT_LOCALE);

    await db.insert(alerts).values({
      id: uuidv7(),
      userId,
      type,
      title,
      body,
      params,
      reportId: reportId ?? null,
    });

    // Best-effort, and awaited on purpose. Awaited because the deploy target is
    // Vercel Functions (CLAUDE.md § Stack), where a promise left floating after
    // the response is written is killed with the invocation — fire-and-forget
    // would mean "sometimes sends" rather than "sends".
    await this.push(userId, type, params, reportId);
  }

  /**
   * Renders the alert in the RECIPIENT's locale and pushes it.
   *
   * Never throws. PushService already swallows its own failures; this second
   * layer exists because the locale lookup and the render happen out here, and
   * a push must not be able to undo an alert row that is already committed —
   * let alone the report, mission or moderation action that raised it.
   */
  private async push(
    userId: string,
    type: AlertType,
    params: AlertParams,
    reportId?: string,
  ): Promise<void> {
    try {
      const locale = await this.resolveLocale(userId);
      // Rendered a second time, in the recipient's language rather than the
      // stored English. A push has no client to re-render it, so this is the
      // only chance to get the language right — hardcoding the English copy
      // above would break the i18n contract for every Tamil user.
      const rendered = renderAlert(type, params, locale);

      await this.pushService.sendToUser(userId, {
        title: rendered.title,
        body: rendered.body,
        // FCM data values must be strings. `type` and `reportId` are what the
        // mobile client needs to deep-link the notification to the right screen
        // (uthavu://requests/:reportId).
        data: { type, ...(reportId ? { reportId } : {}) },
      });
    } catch (error) {
      console.warn(
        `[alerts] push for ${type} to user ${userId} failed — the alert itself was saved`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  private async resolveLocale(userId: string): Promise<AlertLocale> {
    const [recipient] = await db
      .select({ locale: user.locale })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    // Falls back to English for null (never set) or a stale/unknown value —
    // same rule renderAlert() applies, applied early so the fallback is
    // explicit rather than incidental.
    return isAlertLocale(recipient?.locale)
      ? recipient.locale
      : DEFAULT_ALERT_LOCALE;
  }

  async list(userId: string) {
    // An alert about a report a moderator has hidden drops out of the list.
    //
    // WHY DROPPED RATHER THAN KEPT-WITHOUT-THE-LINK. An alert is a personal
    // notification log, so deleting rows would be rewriting history — but these
    // rows are made *of* the report: `params.reportTitle` renders into the body
    // on the client, the stored English title/body already contains it, and
    // `reportId` is the deep link. Nulling the link alone leaves a card that
    // still quotes the removed report's title and now goes nowhere. There is no
    // part of such an alert worth keeping once its subject is gone.
    //
    // The row itself is untouched in Postgres — this is a read filter, so an
    // admin reinstating the report brings the alert back with it.
    //
    // Alerts with no reportId at all (broadcasts, account notices) are
    // unaffected: that is what the `or(isNull(...))` arm protects.
    const rows = await db
      .select({ alert: alerts })
      .from(alerts)
      .leftJoin(reports, eq(alerts.reportId, reports.id))
      .where(
        and(eq(alerts.userId, userId), or(isNull(alerts.reportId), notRemoved)),
      )
      .orderBy(desc(alerts.createdAt))
      .limit(50);

    return rows.map(({ alert: a }) => ({
      id: a.id,
      type: a.type,
      // Kept in the response as the client's fallback for an alert type it
      // doesn't have a catalog entry for yet — a client older than a
      // newly-added type renders these instead of showing a blank row.
      title: a.title,
      body: a.body,
      params: a.params,
      reportId: a.reportId,
      read: a.readAt !== null,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  async markAllRead(userId: string) {
    await db
      .update(alerts)
      .set({ readAt: new Date() })
      .where(and(eq(alerts.userId, userId), isNull(alerts.readAt)));
    return this.list(userId);
  }
}
