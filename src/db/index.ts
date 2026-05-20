/**
 * Database client. Uses postgres.js + Drizzle.
 *
 * The same `postgres` driver speaks the standard Postgres wire protocol, so
 * this works unchanged against local Postgres in development and against the
 * Neon *pooled* connection string in production. A global singleton avoids
 * exhausting connections across Next.js hot reloads / serverless invocations.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/disclosure_ledger";

const globalForDb = globalThis as unknown as {
  __pg?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__pg ??
  postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    prepare: false, // safe with pooled (PgBouncer transaction-mode) connections
  });

if (process.env.NODE_ENV !== "production") globalForDb.__pg = client;

export const db = drizzle(client, { schema });
export { schema };
export type Database = typeof db;
