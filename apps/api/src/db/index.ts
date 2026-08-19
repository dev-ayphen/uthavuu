import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as authSchema from './schema/auth-schema';
import * as reportsSchema from './schema/reports-schema';
import * as missionsSchema from './schema/missions-schema';
import * as devicesSchema from './schema/devices-schema';

const schema = { ...authSchema, ...reportsSchema, ...missionsSchema, ...devicesSchema };

const client = postgres(process.env.DATABASE_URL!);

export const db = drizzle(client, { schema });
