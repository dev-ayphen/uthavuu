import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { alerts } from '../db/schema/alerts-schema';

// Known type tags — not DB-enforced (see alerts-schema.ts), just documented
// here so callers stay consistent.
export type AlertType = 'volunteer_accepted' | 'volunteer_released' | 'mission_completed';

@Injectable()
export class AlertsService {
  async create(userId: string, type: AlertType, title: string, body: string, reportId?: string): Promise<void> {
    await db.insert(alerts).values({
      id: uuidv7(),
      userId,
      type,
      title,
      body,
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
      title: a.title,
      body: a.body,
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
