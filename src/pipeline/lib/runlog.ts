/**
 * Ingestion run logging — every pipeline stage opens and closes a row in
 * `ingestion_runs` so failures are observable (FR-O1).
 */
import { db } from "@/db";
import { ingestionRuns } from "@/db/schema";
import { eq } from "drizzle-orm";

export type Stage =
  | "discover"
  | "fetch"
  | "dedupe"
  | "parse"
  | "reconcile"
  | "ingest-statements"
  | "ingest-cpd"
  | "ingest-actions"
  | "ingest-usaspending"
  | "enrich"
  | "ingest-prices"
  | "detect-mentions"
  | "correlate"
  | "verify-correlations"
  | "graph-build";

export interface RunHandle {
  id: string;
  stage: Stage;
}

export async function startRun(stage: Stage): Promise<RunHandle> {
  const [row] = await db
    .insert(ingestionRuns)
    .values({ stage, startedAt: new Date(), status: "running" })
    .returning({ id: ingestionRuns.id });
  console.log(`[${stage}] run ${row.id} started`);
  return { id: row.id, stage };
}

export async function finishRun(
  handle: RunHandle,
  result: { itemsFound?: number; itemsFailed?: number; errors?: string[] },
): Promise<void> {
  const failed = (result.errors?.length ?? 0) > 0 || (result.itemsFailed ?? 0) > 0;
  await db
    .update(ingestionRuns)
    .set({
      completedAt: new Date(),
      itemsFound: result.itemsFound ?? 0,
      itemsFailed: result.itemsFailed ?? 0,
      errors: result.errors?.length ? result.errors : null,
      status: failed ? "failed" : "completed",
    })
    .where(eq(ingestionRuns.id, handle.id));
  console.log(
    `[${handle.stage}] run ${handle.id} ${failed ? "FAILED" : "completed"} ` +
      `(found=${result.itemsFound ?? 0}, failed=${result.itemsFailed ?? 0})`,
  );
}

/** Wrap a stage function with automatic run logging. */
export async function withRun<T>(
  stage: Stage,
  fn: (handle: RunHandle) => Promise<{ result: T; itemsFound?: number; itemsFailed?: number; errors?: string[] }>,
): Promise<T> {
  const handle = await startRun(stage);
  try {
    const { result, ...rest } = await fn(handle);
    await finishRun(handle, rest);
    return result;
  } catch (err) {
    await finishRun(handle, { errors: [String(err)] });
    throw err;
  }
}
