import { AnalyticsRange, AnalyticsSummary, DerivedTokenUsage, UsageAggregate, UsageEvent } from "./types";
import { calculateEventCost, zeroMoney } from "./pricing";
import { deriveTotalTokens } from "./usage-event";
import { PricingCatalog } from "./types";

function parts(date: Date, timeZone: string): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
}

/** Returns a YYYY-MM-DD key in an IANA timezone. */
export function dayKey(instant: string | Date, timeZone: string): string {
  const p = parts(instant instanceof Date ? instant : new Date(instant), timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

function rangeInstant(value: string, timeZone: string): string {
  if (value.includes("T") || value.endsWith("Z")) return new Date(value).toISOString();
  // Convert a timezone-local calendar date to an instant without a date library.
  const [year, month, day] = value.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offsetParts = parts(new Date(guess), timeZone);
  const localAsUtc = Date.UTC(Number(offsetParts.year), Number(offsetParts.month) - 1, Number(offsetParts.day), Number(offsetParts.hour), Number(offsetParts.minute), Number(offsetParts.second));
  // localAsUtc - guess is the timezone offset at the guessed instant.
  return new Date(guess - (localAsUtc - guess)).toISOString();
}

export function normalizeRange(range: AnalyticsRange): { start: string; end: string; timeZone: string } {
  const start = rangeInstant(range.start, range.timeZone);
  const end = rangeInstant(range.end, range.timeZone);
  if (start >= end) throw new Error("Analytics range end must be after start");
  return { start, end, timeZone: range.timeZone };
}

function emptyTokens(): DerivedTokenUsage { return { input: 0, output: 0, total: 0, inputKnown: true, outputKnown: true, totalKnown: true }; }
function emptyAggregate(key: string): UsageAggregate {
  return {
    key,
    events: 0,
    tokens: emptyTokens(),
    actualCost: zeroMoney("USD", "actual"),
    estimatedCost: zeroMoney("USD", "estimated"),
    requests: 0,
    actualCostEvents: 0,
    unknownCostEvents: 0,
    mixedCurrencies: false,
    unknownInputEvents: 0,
    unknownOutputEvents: 0,
    unknownTotalEvents: 0,
  };
}

function aggregate(events: UsageEvent[], keyFor: (event: UsageEvent) => string, catalog: PricingCatalog): UsageAggregate[] {
  const map = new Map<string, UsageAggregate>();
  for (const event of events) {
    const key = keyFor(event);
    const row = map.get(key) ?? emptyAggregate(key);
    const t = deriveTotalTokens(event.tokens, event.sourceReportedTotal);
    row.events += 1;
    row.requests += event.requestCount ?? 1;
    if (!t.inputKnown) row.unknownInputEvents += 1;
    if (!t.outputKnown) row.unknownOutputEvents += 1;
    if (!t.totalKnown) row.unknownTotalEvents += 1;
    row.tokens.input += t.input; row.tokens.output += t.output; row.tokens.total += t.total;
    row.tokens.inputKnown = row.tokens.inputKnown && t.inputKnown;
    row.tokens.outputKnown = row.tokens.outputKnown && t.outputKnown;
    row.tokens.totalKnown = row.tokens.totalKnown && t.totalKnown;
    for (const field of ["cachedInput", "cacheCreationInput", "reasoningOutput"] as const) row.tokens[field] = (row.tokens[field] ?? 0) + (t[field] ?? 0);
    const cost = calculateEventCost(event, catalog);
    if (cost.actual) {
      if (row.actualCostEvents === 0) row.actualCost.currency = cost.actual.currency;
      else if (row.actualCost.currency !== cost.actual.currency) row.mixedCurrencies = true;
      if (!row.mixedCurrencies || row.actualCost.currency === cost.actual.currency) row.actualCost.amount += cost.actual.amount;
      row.actualCostEvents += 1;
    }
    if (cost.estimated) {
      const estimatedEvents = row.events - row.unknownCostEvents;
      if (estimatedEvents === 1) row.estimatedCost.currency = cost.estimated.currency;
      else if (row.estimatedCost.currency !== cost.estimated.currency) row.mixedCurrencies = true;
      if (!row.mixedCurrencies || row.estimatedCost.currency === cost.estimated.currency) row.estimatedCost.amount += cost.estimated.amount;
    } else { row.unknownCostEvents += 1; }
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function aggregateUsage(events: readonly UsageEvent[], range: AnalyticsRange, catalog: PricingCatalog): AnalyticsSummary {
  const normalized = normalizeRange(range);
  const startMs = Date.parse(normalized.start); const endMs = Date.parse(normalized.end);
  const included = events.filter((event) => { const occurredMs = Date.parse(event.occurredAt); return occurredMs >= startMs && occurredMs < endMs; });
  const total = emptyAggregate("total");
  for (const row of aggregate(included, () => "total", catalog)) {
    total.events = row.events;
    total.tokens = row.tokens;
    total.actualCost = row.actualCost;
    total.estimatedCost = row.estimatedCost;
    total.requests = row.requests;
    total.actualCostEvents = row.actualCostEvents;
    total.unknownCostEvents = row.unknownCostEvents;
    total.mixedCurrencies = row.mixedCurrencies;
    total.unknownInputEvents = row.unknownInputEvents;
    total.unknownOutputEvents = row.unknownOutputEvents;
    total.unknownTotalEvents = row.unknownTotalEvents;
  }
  return {
    range,
    events: total.events,
    tokens: total.tokens,
    actualCost: total.actualCost,
    estimatedCost: total.estimatedCost,
    requests: total.requests,
    actualCostEvents: total.actualCostEvents,
    unknownCostEvents: total.unknownCostEvents,
    mixedCurrencies: total.mixedCurrencies,
    unknownInputEvents: total.unknownInputEvents,
    unknownOutputEvents: total.unknownOutputEvents,
    unknownTotalEvents: total.unknownTotalEvents,
    byDay: aggregate(included, (e) => dayKey(e.occurredAt, range.timeZone), catalog),
    byModel: aggregate(included, (e) => e.model, catalog),
    byProvider: aggregate(included, (e) => e.provider, catalog),
  };
}
