/**
 * Apply committed migrations (`npm run db:migrate`).
 *
 * The schema history lives in src/db/migrations as generated SQL — an
 * auditable ledger, fitting a project whose data store is supposed to be
 * immutable and reviewable. `drizzle-kit push` remains available for local
 * prototyping, but deployed databases should be migrated, not pushed.
 *
 * NOTE for databases previously managed by `push`: the baseline migration
 * creates tables from scratch. On an existing database, either baseline-mark
 * it (apply with `--fake` semantics by inserting into drizzle.__drizzle_migrations)
 * or continue with push until the next clean migration. New deployments just
 * run this.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
  const client = postgres(url, { max: 1, ssl: isLocal ? false : "require" });
  await migrate(drizzle(client), { migrationsFolder: "src/db/migrations" });
  await client.end();
  console.log("[migrate] migrations applied");
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
