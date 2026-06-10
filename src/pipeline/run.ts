/**
 * Pipeline runner. Invoke a single stage or the whole pipeline:
 *
 *   tsx src/pipeline/run.ts discover
 *   tsx src/pipeline/run.ts parse
 *   tsx src/pipeline/run.ts reconcile
 *   tsx src/pipeline/run.ts statements
 *   tsx src/pipeline/run.ts cpd
 *   tsx src/pipeline/run.ts actions
 *   tsx src/pipeline/run.ts usaspending
 *   tsx src/pipeline/run.ts enrich
 *   tsx src/pipeline/run.ts prices
 *   tsx src/pipeline/run.ts mentions
 *   tsx src/pipeline/run.ts correlate
 *   tsx src/pipeline/run.ts verify
 *   tsx src/pipeline/run.ts graph
 *   tsx src/pipeline/run.ts all
 *
 * Each stage is idempotent and logs to `ingestion_runs`. In `all` mode every
 * stage runs in its own failure domain: a discovery network blip must not
 * cost the day's statements, correlations, and graph rebuild (reliability
 * NFR — partial failure never aborts independent downstream work). The
 * process exits non-zero if any stage failed, so CI still alerts.
 */
import { withRun } from "./lib/runlog";
import { discover } from "./stages/discover";
import { fetchFilings } from "./stages/fetch";
import { dedupeFilings } from "./stages/dedupe";
import { parseFilings } from "./stages/parse";
import { reconcile } from "./stages/reconcile";
import { enrichTransactions } from "./stages/enrich";
import { ingestPrices } from "./stages/ingest-prices";
import { ingestStatements } from "./stages/ingest-statements";
import { ingestApp } from "./stages/ingest-app";
import { ingestCpd } from "./stages/ingest-cpd";
import { ingestYoutube } from "./stages/ingest-youtube";
import { ingestActions } from "./stages/ingest-actions";
import { ingestUsaSpending } from "./stages/ingest-usaspending";
import { ingestWhiteHouse } from "./stages/ingest-whitehouse";
import { detectMentions } from "./stages/detect-mentions";
import { llmMentions } from "./stages/llm-mentions";
import { correlate } from "./stages/correlate";
import { verifyCorrelations } from "./stages/verify-correlations";
import { buildGraph } from "./stages/graph-build";

async function runDiscoverAndFetch(): Promise<void> {
  const candidates = await withRun("discover", async () => {
    const result = await discover();
    return { result, itemsFound: result.length };
  });
  await withRun("fetch", async () => {
    const result = await fetchFilings(candidates);
    return { result, itemsFound: result.fetched, itemsFailed: result.errors.length,
             errors: result.errors };
  });
}

const runDedupe = () =>
  withRun("dedupe", async () => {
    const result = await dedupeFilings();
    return { result, itemsFound: result.superseded };
  });

const runParse = () =>
  withRun("parse", async () => {
    const result = await parseFilings();
    return { result, itemsFound: result.parsed, itemsFailed: result.failed,
             errors: result.errors };
  });

const runReconcile = () =>
  withRun("reconcile", async () => {
    const result = await reconcile();
    return { result, itemsFound: result.matched, errors: result.errors };
  });

const runStatements = () =>
  withRun("ingest-statements", async () => {
    const result = await ingestStatements();
    return { result, itemsFound: result.ingested, errors: result.errors };
  });

const runApp = () =>
  withRun("ingest-app", async () => {
    const result = await ingestApp();
    return { result, itemsFound: result.ingested, errors: result.errors };
  });

const runCpd = () =>
  withRun("ingest-cpd", async () => {
    const result = await ingestCpd();
    return { result, itemsFound: result.ingested, errors: result.errors };
  });

const runYoutube = () =>
  withRun("ingest-youtube", async () => {
    const result = await ingestYoutube();
    return { result, itemsFound: result.ingested, errors: result.errors };
  });

const runActions = () =>
  withRun("ingest-actions", async () => {
    const fr = await ingestActions();
    const wh = await ingestWhiteHouse();
    return {
      result: { fr, wh },
      itemsFound: fr.ingested + wh.ingested + wh.remarksIngested,
      errors: [...fr.errors, ...wh.errors],
    };
  });

const runUsaSpending = () =>
  withRun("ingest-usaspending", async () => {
    const result = await ingestUsaSpending();
    return { result, itemsFound: result.ingested, errors: result.errors };
  });

const runEnrich = () =>
  withRun("enrich", async () => {
    const result = await enrichTransactions();
    return { result, itemsFound: result.resolved };
  });

const runPrices = () =>
  withRun("ingest-prices", async () => {
    const result = await ingestPrices();
    return { result, itemsFound: result.pricePoints, errors: result.errors };
  });

const runMentions = () =>
  withRun("detect-mentions", async () => {
    const result = await detectMentions();
    return { result, itemsFound: result.statementMentions };
  });

const runLlmMentions = () =>
  withRun("llm-mentions", async () => {
    const result = await llmMentions();
    return { result, itemsFound: result.enriched + result.added, errors: result.errors };
  });

const runCorrelate = () =>
  withRun("correlate", async () => {
    const result = await correlate();
    return { result, itemsFound: result.pairs };
  });

const runVerify = () =>
  withRun("verify-correlations", async () => {
    const result = await verifyCorrelations();
    return { result, itemsFound: result.verified };
  });

const runGraph = () =>
  withRun("graph-build", async () => {
    const result = await buildGraph();
    return { result, itemsFound: result.edges };
  });

/**
 * Run stages sequentially, each in its own failure domain. Returns the names
 * of failed stages; later stages still run (they are idempotent and operate
 * on whatever data the earlier stages managed to land).
 */
async function runIsolated(
  stages: [name: string, fn: () => Promise<unknown>][],
): Promise<string[]> {
  const failed: string[] = [];
  for (const [name, fn] of stages) {
    try {
      await fn();
    } catch (err) {
      failed.push(name);
      console.error(`[pipeline] stage '${name}' failed (continuing): ${String(err)}`);
    }
  }
  return failed;
}

const FULL_PIPELINE: [string, () => Promise<unknown>][] = [
  ["discover+fetch", runDiscoverAndFetch],
  ["dedupe", runDedupe],
  ["parse", runParse],
  ["reconcile", runReconcile],
  ["statements", runStatements],
  ["app", runApp],
  ["cpd", runCpd],
  ["youtube", runYoutube],
  ["actions", runActions],
  ["usaspending", runUsaSpending],
  ["enrich", runEnrich],
  ["prices", runPrices],
  ["mentions", runMentions],
  ["llm-mentions", runLlmMentions],
  ["correlate", runCorrelate],
  ["verify", runVerify],
  ["graph", runGraph],
];

async function main(): Promise<void> {
  const stage = process.argv[2] ?? "all";
  switch (stage) {
    case "discover":
    case "fetch":
      await runDiscoverAndFetch();
      break;
    case "dedupe":
      await runDedupe();
      break;
    case "parse":
      await runParse();
      break;
    case "reconcile":
      await runReconcile();
      break;
    case "statements":
      await runStatements();
      break;
    case "app":
      await runApp();
      break;
    case "cpd":
      await runCpd();
      break;
    case "youtube":
      await runYoutube();
      break;
    case "actions":
      await runActions();
      break;
    case "usaspending":
      await runUsaSpending();
      break;
    case "enrich":
      await runEnrich();
      break;
    case "prices":
      await runPrices();
      break;
    case "mentions":
      await runMentions();
      break;
    case "llm-mentions":
      await runLlmMentions();
      break;
    case "correlate":
      await runCorrelate();
      break;
    case "verify":
      await runVerify();
      break;
    case "graph":
      await runGraph();
      break;
    case "all": {
      const failed = await runIsolated(FULL_PIPELINE);
      if (failed.length > 0) {
        console.error(`[pipeline] completed with ${failed.length} failed stage(s): ${failed.join(", ")}`);
        process.exit(1);
      }
      break;
    }
    case "post-parse": {
      // Everything after parse — useful while parse runs separately.
      const failed = await runIsolated(FULL_PIPELINE.slice(3));
      if (failed.length > 0) {
        console.error(`[pipeline] completed with ${failed.length} failed stage(s): ${failed.join(", ")}`);
        process.exit(1);
      }
      break;
    }
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
