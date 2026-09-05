import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as authSchema from './schema/auth-schema';
import * as reportsSchema from './schema/reports-schema';
import * as missionsSchema from './schema/missions-schema';
import * as devicesSchema from './schema/devices-schema';
import * as alertsSchema from './schema/alerts-schema';
import * as commentsSchema from './schema/comments-schema';
import * as savesSchema from './schema/saves-schema';
import * as ticketsSchema from './schema/tickets-schema';
import * as adminSchema from './schema/admin-schema';
import * as auditSchema from './schema/audit-schema';
import * as userStatusSchema from './schema/user-status-schema';
import * as updatesSchema from './schema/updates-schema';
import * as settingsSchema from './schema/settings-schema';
import * as sponsorsSchema from './schema/sponsors-schema';
import * as broadcastsSchema from './schema/broadcasts-schema';
import * as photoVerificationSchema from './schema/photo-verification-schema';

const schema = {
  ...authSchema,
  ...reportsSchema,
  ...missionsSchema,
  ...devicesSchema,
  ...alertsSchema,
  ...commentsSchema,
  ...savesSchema,
  ...ticketsSchema,
  ...adminSchema,
  ...auditSchema,
  ...userStatusSchema,
  ...updatesSchema,
  ...settingsSchema,
  ...sponsorsSchema,
  ...broadcastsSchema,
  ...photoVerificationSchema,
};

const client = postgres(process.env.DATABASE_URL!);

export const db = drizzle(client, { schema });
