import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as authSchema from './schema/auth-schema';
import * as reportsSchema from './schema/reports-schema';
import * as missionsSchema from './schema/missions-schema';
import * as devicesSchema from './schema/devices-schema';
import * as alertsSchema from './schema/alerts-schema';
import * as commentsSchema from './schema/comments-schema';
import * as likesSchema from './schema/likes-schema';

const schema = {
  ...authSchema,
  ...reportsSchema,
  ...missionsSchema,
  ...devicesSchema,
  ...alertsSchema,
  ...commentsSchema,
  ...likesSchema,
};

const client = postgres(process.env.DATABASE_URL!);

export const db = drizzle(client, { schema });
