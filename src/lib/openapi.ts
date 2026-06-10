/**
 * OpenAPI 3.1 specification for the public API (FR-API4).
 *
 * Single source of truth: served at /api/v1/openapi.json AND rendered by the
 * /api-docs page, so the documentation can never drift from the spec.
 */
import { ANONYMOUS_DAILY_LIMIT, DEFAULT_KEY_DAILY_LIMIT } from "./ratelimit";

const envelope = (itemRef: string) => ({
  type: "object",
  properties: {
    data: { type: "array", items: { $ref: itemRef } },
    meta: { $ref: "#/components/schemas/Meta" },
  },
});

const paging = [
  { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
  {
    name: "limit",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 200, default: 50 },
  },
];

const dateRange = [
  { name: "dateFrom", in: "query", schema: { type: "string", format: "date" } },
  { name: "dateTo", in: "query", schema: { type: "string", format: "date" } },
];

export const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Trump Stock Tracker — Public API",
    version: "1.0.0",
    description:
      "Read-only access to the structured record of the President's disclosed securities transactions, his public statements, official government actions, and transparently-scored timing correlations between them. Disclosed amounts are statutory ranges, never exact figures. Correlations are analytical indices, never findings of wrongdoing. Data is used solely for news and transparency dissemination (5 U.S.C. § 13107(c)).",
    contact: { name: "Trump Stock Tracker", email: "benjamin@opencivics.co" },
  },
  servers: [{ url: "/api/v1" }],
  security: [{}, { apiKey: [] }],
  components: {
    securitySchemes: {
      apiKey: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: `Optional. Anonymous callers: ${ANONYMOUS_DAILY_LIMIT} requests/day per IP. Keyed callers: ${DEFAULT_KEY_DAILY_LIMIT}/day by default. Limits are returned in X-RateLimit-* headers.`,
      },
    },
    schemas: {
      Meta: {
        type: "object",
        properties: {
          total: { type: "integer" },
          page: { type: "integer" },
          totalPages: { type: "integer" },
          generatedAt: { type: "string", format: "date-time" },
        },
      },
      Transaction: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          rowNumber: { type: "integer" },
          descriptionRaw: { type: "string", description: "verbatim security description" },
          transactionType: {
            type: "string",
            enum: ["Purchase", "Sale", "Sale (Partial)", "Exchange", "Unknown"],
          },
          transactionDate: { type: "string", format: "date" },
          notificationLate: { type: "boolean", nullable: true },
          amountBand: { type: "integer", minimum: 1, maximum: 10 },
          amountMin: { type: "integer", description: "statutory band lower bound (USD)" },
          amountMax: {
            type: "integer",
            nullable: true,
            description: "statutory band upper bound; null = unbounded (band 10)",
          },
          ticker: { type: "string", nullable: true },
          companyName: { type: "string", nullable: true },
          sector: { type: "string", nullable: true },
          filingId: { type: "string", format: "uuid" },
          filingDate: { type: "string", format: "date" },
          sourceUrl: { type: "string", description: "the source filing PDF" },
        },
      },
      Filing: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          formType: { type: "string" },
          filingDate: { type: "string", format: "date" },
          sourceUrl: { type: "string" },
          pageCount: { type: "integer", nullable: true },
          transactionCount: { type: "integer", nullable: true },
          parseMethod: { type: "string", nullable: true },
          parseConfidence: { type: "number", nullable: true },
          status: { type: "string" },
        },
      },
      Statement: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          spokenAt: { type: "string", format: "date" },
          channel: { type: "string", nullable: true },
          venue: { type: "string", nullable: true },
          fullText: { type: "string" },
          source: { type: "string" },
          sourceUrl: { type: "string" },
          attributionMethod: {
            type: "string",
            enum: ["official_transcript", "caption_derived"],
          },
          attributionConf: { type: "number" },
        },
      },
      Action: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          actionType: { type: "string" },
          occurredOn: { type: "string", format: "date" },
          signedOn: { type: "string", format: "date", nullable: true },
          title: { type: "string" },
          summary: { type: "string", nullable: true },
          source: { type: "string" },
          sourceRef: { type: "string", nullable: true },
          sourceUrl: { type: "string" },
        },
      },
      Correlation: {
        type: "object",
        description:
          "A scored (trade ↔ event) timing pair. The signal is an analytical index — never a verdict. Every component of the score is included.",
        properties: {
          id: { type: "string", format: "uuid" },
          transactionId: { type: "string", format: "uuid" },
          eventKind: { type: "string", enum: ["statement", "action"] },
          statementId: { type: "string", format: "uuid", nullable: true },
          actionId: { type: "string", format: "uuid", nullable: true },
          daysGap: {
            type: "integer",
            description: "event date − transaction date, signed days",
          },
          signalScore: { type: "number", minimum: 0, maximum: 100 },
          components: { type: "object", description: "full auditable score breakdown" },
          scoringVersion: { type: "string" },
        },
      },
      Company: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          ticker: { type: "string", nullable: true },
          sector: { type: "string", nullable: true },
          industry: { type: "string", nullable: true },
          tradeCount: { type: "integer" },
          correlationCount: { type: "integer" },
          topSignal: { type: "number", nullable: true },
        },
      },
      Graph: {
        type: "object",
        properties: {
          nodes: { type: "array", items: { type: "object" } },
          links: { type: "array", items: { type: "object" } },
        },
      },
      Error: { type: "object", properties: { error: { type: "string" } } },
    },
  },
  paths: {
    "/transactions": {
      get: {
        summary: "Query disclosed transactions",
        description:
          "Searchable, filterable, paginated. Only transactions from publicly-released filings are returned.",
        parameters: [
          { name: "search", in: "query", schema: { type: "string", maxLength: 120 } },
          {
            name: "type",
            in: "query",
            schema: {
              type: "string",
              enum: ["Purchase", "Sale", "Sale (Partial)", "Exchange"],
            },
          },
          ...dateRange,
          {
            name: "bandMin",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 10 },
          },
          {
            name: "sortBy",
            in: "query",
            schema: { type: "string", enum: ["date", "amount", "description"] },
          },
          { name: "order", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
          ...paging,
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/Transaction"),
              },
            },
          },
          "400": { description: "Invalid query parameters" },
          "429": { description: "Rate limit exceeded" },
        },
      },
    },
    "/transactions/{id}": {
      get: {
        summary: "One transaction with its correlations",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": { description: "OK" },
          "404": { description: "Not found (or not publicly released)" },
        },
      },
    },
    "/filings": {
      get: {
        summary: "List publicly-released filings",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": { schema: envelope("#/components/schemas/Filing") },
            },
          },
        },
      },
    },
    "/statements": {
      get: {
        summary: "Query the President's public statements",
        parameters: [
          ...dateRange,
          { name: "channel", in: "query", schema: { type: "string" } },
          {
            name: "ticker",
            in: "query",
            schema: { type: "string" },
            description: "only statements mentioning this company",
          },
          ...paging,
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": { schema: envelope("#/components/schemas/Statement") },
            },
          },
        },
      },
    },
    "/actions": {
      get: {
        summary: "Query official government actions",
        parameters: [
          ...dateRange,
          { name: "type", in: "query", schema: { type: "string" } },
          {
            name: "ticker",
            in: "query",
            schema: { type: "string" },
            description: "only actions affecting this company",
          },
          ...paging,
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": { schema: envelope("#/components/schemas/Action") },
            },
          },
        },
      },
    },
    "/correlations": {
      get: {
        summary: "Query scored timing correlations",
        parameters: [
          {
            name: "transactionId",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
          { name: "ticker", in: "query", schema: { type: "string" } },
          {
            name: "kind",
            in: "query",
            schema: { type: "string", enum: ["statement", "action"] },
          },
          {
            name: "minScore",
            in: "query",
            schema: { type: "number", minimum: 0, maximum: 100 },
          },
          ...paging,
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/Correlation"),
              },
            },
          },
        },
      },
    },
    "/companies": {
      get: {
        summary: "Companies in the disclosure dataset with aggregates",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": { schema: envelope("#/components/schemas/Company") },
            },
          },
        },
      },
    },
    "/companies/{ticker}": {
      get: {
        summary: "One company: profile, trades, prices, correlations",
        parameters: [
          { name: "ticker", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
    "/graph": {
      get: {
        summary: "The knowledge graph as { nodes, links }",
        description:
          "Without parameters: the full company-aggregated graph. With node + depth: a bounded breadth-first neighborhood of one node (lazy expansion; depth ≤ 3, hard edge cap).",
        parameters: [
          {
            name: "node",
            in: "query",
            schema: {
              type: "string",
              pattern: "^(person|company|filing|statement|action):[0-9a-f-]{36}$",
            },
            description: "root node as <type>:<uuid>",
          },
          {
            name: "depth",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 3, default: 2 },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/Graph" },
                    meta: { $ref: "#/components/schemas/Meta" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/export/transactions.ndjson": {
      get: {
        summary: "Bulk export — every public transaction as NDJSON",
        description: "One JSON object per line; suitable for jq / pandas pipelines.",
        responses: {
          "200": { description: "OK", content: { "application/x-ndjson": {} } },
        },
      },
    },
    "/export/transactions.csv": {
      get: {
        summary: "Bulk export — every public transaction as CSV",
        responses: { "200": { description: "OK", content: { "text/csv": {} } } },
      },
    },
    "/openapi.json": {
      get: {
        summary: "This specification",
        responses: { "200": { description: "OK" } },
      },
    },
  },
} as const;
