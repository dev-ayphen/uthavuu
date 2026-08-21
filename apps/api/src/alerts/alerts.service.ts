import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { alerts } from '../db/schema/alerts-schema';
import {
  DEFAULT_ALERT_LOCALE,
  renderAlert,
  type AlertParams,
  type AlertType,
} from './alert-templates';

export type { AlertType, AlertParams } from './alert-templates';

@Injectable()
export class AlertsService {
  // Callers pass structured `params`, never prose. The English rendering is
  // stored alongside them so the row stays self-describing and older clients
  // still have something to show; the mobile app re-renders from `type` +
  // `params` in the user's current language. See alert-templates.ts.
  async create(userId: string, type: AlertType, params: AlertParams, reportId?: string): Promise<void> {
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
  }

  async list(userId: string) {
    const rows = await db
      .select()
      .from(alerts)
      .where(eq(alerts.userId, userId))
      .orderBy(desc(alerts.createdAt))
      .limit(50);

    return rows.map((a) => ({
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
