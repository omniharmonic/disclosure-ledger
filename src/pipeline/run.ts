/**
 * Pipeline runner. Invoke a single stage or the whole pipeline:
 *
 *   tsx src/pipeline/run.ts discover
 *   tsx src/pipeline/run.ts fetch
 *   tsx src/pipeline/run.ts parse
 *   tsx src/pipeline/run.ts all
 *
 * Each stage is idempotent and logs to `ingestion_runs`.
 */
import { withRun } from "./lib/runlog";
import { discover } from "./stages/discover";
import { fetchFilings } from "./stages/fetch";
import { parseFilings } from "./stages/parse";
import { enrichTransactions } from "./stages/enrich";

async function runDiscoverAndFetch(): Promise<void> {
  const candidates = await withRun("discover", async () => {
    const result = await discover();
    return { result, itemsFound: result.length };
  });
  await withRun("fetch", async () => {
    const result = await fetchFilings(candidates);
    return {
      result,
      itemsFound: result.fetched,
      itemsFailed: result.errors.length,
      errors: result.errors,
    };
  });
}

async function runParse(): Promise<void> {
  await withRun("parse", async () => {
    const result = await parseFilings();
    return {
      result,
      itemsFound: result.parsed,
      itemsFailed: result.failed,
      errors: result.errors,
    };
  });
}

async function runEnrich(): Promise<void> {
  await withRun("enrich", async () => {
    const result = await enrichTransactions();
    return { result, itemsFound: result.resolved };
  });
}

async function main(): Promise<void> {
  const stage = process.argv[2] ?? "all";
  switch (stage) {
    case "discover":
    case "fetch":
      await runDiscoverAndFetch();
      break;
    case "parse":
      await runParse();
      break;
    case "enrich":
      await runEnrich();
      break;
    case "all":
      await runDiscoverAndFetch();
      await runParse();
      await runEnrich();
      break;
    default:
      console.error(`Unknown stage: ${stage}`);
      process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[pipeline] fatal:", err);
  process.exit(1);
});
