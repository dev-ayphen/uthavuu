import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as authSchema from './schema/auth-schema';
import * as reportsSchema from './schema/reports-schema';

const schema = { ...authSchema, ...reportsSchema };

const client = postgres(process.env.DATABASE_URL!);

export const db = drizzle(client, { schema });
