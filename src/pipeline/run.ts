/**
 * Pipeline runner. Invoke a single stage or the whole pipeline:
 *
 *   tsx src/pipeline/run.ts discover
 *   tsx src/pipeline/run.ts parse
 *   tsx src/pipeline/run.ts statements
 *   tsx src/pipeline/run.ts actions
 *   tsx src/pipeline/run.ts enrich
 *   tsx src/pipeline/run.ts mentions
 *   tsx src/pipeline/run.ts correlate
 *   tsx src/pipeline/run.ts graph
 *   tsx src/pipeline/run.ts all
 *
 * Each stage is idempotent and logs to `ingestion_runs`.
 */
import { withRun } from "./lib/runlog";
import { discover } from "./stages/discover";
import { fetchFilings } from "./stages/fetch";
import { dedupeFilings } from "./stages/dedupe";
import { parseFilings } from "./stages/parse";
import { enrichTransactions } from "./stages/enrich";
import { ingestPrices } from "./stages/ingest-prices";
import { ingestStatements } from "./stages/ingest-statements";
import { ingestActions } from "./stages/ingest-actions";
import { ingestWhiteHouse } from "./stages/ingest-whitehouse";
import { detectMentions } from "./stages/detect-mentions";
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

const runStatements = () =>
  withRun("ingest-statements", async () => {
    const result = await ingestStatements();
    return { result, itemsFound: result.ingested, errors: result.errors };
  });

const runActions = () =>
  withRun("ingest-actions", async () => {
    const fr = await ingestActions();
    const wh = await ingestWhiteHouse();
    return {
      result: { fr, wh },
      itemsFound: fr.ingested + wh.ingested,
      errors: [...fr.errors, ...wh.errors],
    };
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
    case "statements":
      await runStatements();
      break;
    case "actions":
      await runActions();
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
    case "correlate":
      await runCorrelate();
      break;
    case "verify":
      await runVerify();
      break;
    case "graph":
      await runGraph();
      break;
    case "all":
      await runDiscoverAndFetch();
      await runDedupe();
      await runParse();
      await runStatements();
      await runActions();
      await runEnrich();
      await runPrices();
      await runMentions();
      await runCorrelate();
      await runVerify();
      await runGraph();
      break;
    case "post-parse":
      // Everything after parse — useful while parse runs separately.
      await runStatements();
      await runActions();
      await runEnrich();
      await runPrices();
      await runMentions();
      await runCorrelate();
      await runVerify();
      await runGraph();
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
