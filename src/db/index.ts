/**
 * Database clients. Uses postgres.js + Drizzle.
 *
 * The same `postgres` driver speaks the standard Postgres wire protocol, so
 * this works unchanged against local Postgres in development and against the
 * Neon *pooled* connection string in production. A global singleton avoids
 * exhausting connections across Next.js hot reloads / serverless invocations.
 *
 * Two clients (ARCHITECTURE §10):
 *   • `db`   — the write client (pipeline; plus the API rate-limit counter,
 *              the only serving-tier write — scope the role's grants to it).
 *   • `dbRo` — the read client used by every public query. Set
 *              DATABASE_URL_RO to a read-only role's connection string in
 *              production; it falls back to DATABASE_URL so local dev and
 *              the pipeline need no extra configuration.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const writeUrl =
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/disclosure_ledger";
const readUrl = process.env.DATABASE_URL_RO ?? writeUrl;

const globalForDb = globalThis as unknown as {
  __pg?: ReturnType<typeof postgres>;
  __pgRo?: ReturnType<typeof postgres>;
};

function makeClient(connectionString: string) {
  const isLocal =
    connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
  return postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    prepare: false, // safe with pooled (PgBouncer transaction-mode) connections
    ssl: isLocal ? false : "require", // Neon (and any managed Postgres) requires TLS
  });
}

const client = globalForDb.__pg ?? makeClient(writeUrl);
const clientRo =
  readUrl === writeUrl ? client : (globalForDb.__pgRo ?? makeClient(readUrl));

if (process.env.NODE_ENV !== "production") {
  globalForDb.__pg = client;
  globalForDb.__pgRo = clientRo;
}

export const db = drizzle(client, { schema });
export const dbRo = drizzle(clientRo, { schema });
export { schema };
export type Database = typeof db;
