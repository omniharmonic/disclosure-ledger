/**
 * Sub-industry topic gazetteer.
 *
 * Connects sector-level language in statements/actions ("semiconductors",
 * "drug prices", "the airlines") to companies in the traded universe via
 * their EDGAR SIC industry description — the PRD's sub-industry tier of
 * entity specificity (0.6, vs 1.0 for a direct issuer mention).
 *
 * Precision rules, mirroring the company gazetteer: every statementPattern
 * is a phrase distinctive enough that a match is genuinely *about the
 * industry* ("chip makers"), never a stray word ("chips" alone would hit
 * snack food). Bias to precision — a missed sector mention costs recall; a
 * false one manufactures a conflict signal.
 */
export interface SectorTopic {
  /** Canonical topic key, stored in statement_mentions.sector / action_targets.sector. */
  topic: string;
  /** Human label for UI. */
  label: string;
  /** Matches industry talk inside statement/action text. */
  statementPattern: RegExp;
  /** Matches companies via their EDGAR SIC industry description. */
  industryPattern: RegExp;
}

export const SECTOR_TOPICS: readonly SectorTopic[] = [
  {
    topic: "semiconductors",
    label: "Semiconductors",
    statementPattern:
      /\bsemiconductors?\b|\bmicrochips?\b|\bchip\s+(?:makers?|industry|companies|manufactur\w+|plants?|factor\w+)\b|\bAI\s+chips?\b/i,
    industryPattern: /semiconductor/i,
  },
  {
    topic: "airlines",
    label: "Airlines",
    statementPattern: /\bairlines?\b|\bair\s+carriers?\b|\bair\s+travel\b|\baviation\s+industry\b/i,
    industryPattern: /air\s*transport|air\s*courier/i,
  },
  {
    topic: "pharmaceuticals",
    label: "Pharmaceuticals",
    statementPattern:
      /\bpharmaceuticals?\b|\bbig\s+pharma\b|\bdrug\s+(?:prices?|pricing|makers?|companies|manufactur\w+)\b|\bprescription\s+drugs?\b/i,
    industryPattern: /pharmaceutical|medicinal|biological\s+products/i,
  },
  {
    topic: "defense",
    label: "Defense industry",
    statementPattern:
      /\bdefense\s+(?:contractors?|industry|companies|spending)\b|\bmissile\s+defense\b|\bmilitary\s+(?:equipment|hardware|procurement)\b/i,
    industryPattern: /ordnance|guided\s+missiles|defense|aircraft|aerospace/i,
  },
  {
    topic: "banks",
    label: "Banking",
    statementPattern:
      /\bbig\s+banks?\b|\bbanking\s+(?:industry|system|regulations?)\b|\bwall\s+street\s+banks?\b/i,
    industryPattern: /\bbanks?\b|national\s+commercial|savings\s+institution/i,
  },
  {
    topic: "oil_gas",
    label: "Oil & gas",
    statementPattern:
      /\boil\s+and\s+gas\b|\boil\s+(?:companies|producers?|industry|drilling)\b|\bfracking\b|\bnatural\s+gas\s+(?:producers?|exports?)\b|\bdrill,?\s*baby,?\s*drill\b/i,
    industryPattern: /petroleum|crude|natural\s+gas|oil\s+(?:and|&)\s+gas|drilling/i,
  },
  {
    topic: "automakers",
    label: "Automakers",
    statementPattern:
      /\bautomakers?\b|\bauto\s+(?:industry|companies|workers|plants?|tariffs?)\b|\bcar\s+(?:makers?|companies|manufactur\w+)\b/i,
    industryPattern: /motor\s+vehicle/i,
  },
  {
    topic: "steel_aluminum",
    label: "Steel & aluminum",
    statementPattern:
      /\bsteel\s+(?:industry|workers?|imports?|tariffs?|mills?|companies)\b|\baluminum\s+(?:imports?|tariffs?|industry)\b/i,
    industryPattern: /steel\s+works|blast\s+furnace|aluminum/i,
  },
  {
    topic: "electric_utilities",
    label: "Electric utilities",
    statementPattern:
      /\belectric\s+(?:utilities|grid|bills?)\b|\bpower\s+grid\b|\bratepayers?\b|\belectricity\s+prices?\b/i,
    industryPattern: /electric\s+services/i,
  },
] as const;

const BY_TOPIC = new Map(SECTOR_TOPICS.map((t) => [t.topic, t]));

export function topicLabel(topic: string): string {
  return BY_TOPIC.get(topic)?.label ?? topic.replace(/_/g, " ");
}

/** Topics applicable to a company, from its EDGAR industry/sector strings. */
export function topicsForCompany(industry: string | null, sector: string | null): string[] {
  const hay = `${industry ?? ""} ${sector ?? ""}`;
  if (!hay.trim()) return [];
  return SECTOR_TOPICS.filter((t) => t.industryPattern.test(hay)).map((t) => t.topic);
}
