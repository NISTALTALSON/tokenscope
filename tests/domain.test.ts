import { describe, expect, it } from "vitest";
import {
  aggregateUsage,
  calculateEventCost,
  calculateScenario,
  convertMoney,
  createUsageEvent,
  deriveTotalTokens,
  MemoryUsageEventRepository,
  parseCsv,
  serializeEvents,
  type PricingCatalog,
} from "../src/lib";

const catalog: PricingCatalog = {
  version: "test-2026-01",
  rules: [{
    provider: "OpenAI",
    model: "gpt-test",
    version: "v1",
    rate: { inputPerMillion: 2, outputPerMillion: 4, cachedInputPerMillion: 0.5, currency: "USD" },
  }],
};

const event = (overrides: Record<string, unknown> = {}) => createUsageEvent({
  id: "evt-1",
  occurredAt: "2026-02-01T08:30:00Z",
  provider: "OpenAI",
  model: "gpt-test",
  tokens: { input: 1_000, output: 500, cachedInput: 400 },
  ...overrides,
} as Parameters<typeof createUsageEvent>[0]);

describe("canonical token totals and pricing", () => {
  it("does not add cached or reasoning subsets twice", () => {
    expect(deriveTotalTokens({ input: 100, output: 50, cachedInput: 75, reasoningOutput: 20 }).total).toBe(150);
    expect(deriveTotalTokens({ input: 100, output: 50 }, 999).total).toBe(999);
  });

  it("keeps actual spend separate from calculated API-equivalent cost", () => {
    const priced = event({ actualCost: { amount: 0.02, currency: "USD", kind: "actual" } });
    const costs = calculateEventCost(priced, catalog);
    expect(costs.actual?.amount).toBe(0.02);
    // (600 regular input * $2 + 400 cached input * $0.50 + 500 output * $4) / 1m
    expect(costs.estimated?.amount).toBe(0.0034);
  });

  it("reports no estimate when a model has no pricing rule", () => {
    expect(calculateEventCost(event({ model: "unknown-model" }), catalog).estimated).toBeUndefined();
  });

  it("requires an explicit exchange rate for currency conversion", () => {
    const converted = convertMoney({ amount: 10, currency: "USD", kind: "estimated" }, {
      from: "USD", to: "EUR", rate: 0.9, asOf: "2026-02-01", source: "test fixture",
    });
    expect(converted.amount).toBe(9);
    expect(converted.currency).toBe("EUR");
  });

  it("flags mixed currencies instead of combining them under one symbol", () => {
    const summary = aggregateUsage([
      event({ id: "usd", actualCost: { amount: 1, currency: "USD", kind: "actual" } }),
      event({ id: "eur", actualCost: { amount: 1, currency: "EUR", kind: "actual" } }),
    ], { start: "2026-02-01", end: "2026-02-02", timeZone: "UTC" }, catalog);
    expect(summary.mixedCurrencies).toBe(true);
  });
});

describe("ingestion and persistence", () => {
  it("maps flexible CSV headers and reports repeated rows as duplicates", () => {
    const csv = [
      "timestamp,provider,model,prompt_tokens,completion_tokens,cost_usd",
      "2026-02-01T08:30:00Z,OpenAI,gpt-test,1000,500,0.02",
      "2026-02-01T08:30:00Z,OpenAI,gpt-test,1000,500,0.02",
    ].join("\n");
    const result = parseCsv(csv, { source: "test.csv" });
    expect(result.events).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
    expect(result.events[0].actualCost?.amount).toBe(0.02);
  });

  it("rejects rows with no token components instead of turning missing values into zero", () => {
    const result = parseCsv("date,provider,model,input,output\nnot-a-date,OpenAI,gpt-test,,");
    expect(result.events).toHaveLength(0);
    expect(result.errors[0].issues.some((issue) => issue.path === "tokens")).toBe(true);
  });

  it("accepts a source-reported total when input/output splits are unavailable", () => {
    const result = parseCsv("date,provider,model,total_tokens\n2026-02-01T08:30:00Z,OpenAI,gpt-test,1500");
    expect(result.events).toHaveLength(1);
    expect(result.events[0].tokens.input).toBeUndefined();
    expect(result.events[0].sourceReportedTotal).toBe(1500);
  });

  it("is idempotent when a connector repeats the same source event", async () => {
    const repo = new MemoryUsageEventRepository();
    const first = event({ id: "source-event-1", sourceEventId: "source-event-1" });
    await repo.putMany([first]);
    await repo.putMany([first]);
    expect(await repo.getAll()).toHaveLength(1);
  });
});

describe("timezone-aware analytics and forecasting", () => {
  it("groups by the selected local day and uses an exclusive end boundary", () => {
    const beforeLocalDay = event({ id: "before", occurredAt: "2026-02-01T07:30:00Z" });
    const inLocalDay = event({ id: "inside", occurredAt: "2026-02-01T08:30:00Z" });
    const summary = aggregateUsage([beforeLocalDay, inLocalDay], {
      start: "2026-02-01", end: "2026-02-02", timeZone: "America/Los_Angeles",
    }, catalog);
    expect(summary.events).toBe(1);
    expect(summary.byDay[0].key).toBe("2026-02-01");
  });

  it("calculates a transparent startup scenario with budget headroom", () => {
    const scenario = calculateScenario({
      name: "Launch",
      monthlyActiveUsers: 100,
      requestsPerUserPerDay: 2,
      inputTokensPerRequest: 1_000,
      outputTokensPerRequest: 500,
      cachedInputPercent: 50,
      activeDaysPerMonth: 30,
      inputPerMillion: 2,
      outputPerMillion: 4,
      cacheInputPerMillion: 0.5,
      fixedMonthlyFees: 10,
      budgetLimit: 100,
    });
    expect(scenario.totalTokensPerMonth).toBe(9_000_000);
    expect(scenario.totalCostPerMonth).toBe(29.5);
    expect(scenario.budgetHeadroom).toBe(70.5);
    expect(scenario.milestones.some((milestone) => milestone.users === 1_000)).toBe(true);
  });
});

describe("exports", () => {
  it("emits a round-trippable CSV header and escaped fields", () => {
    const csv = serializeEvents([event({ provider: "Provider, Inc." })], "csv");
    expect(csv.split("\n")[0]).toContain("sourceReportedTotal");
    expect(csv).toContain('"Provider, Inc."');
  });
});
