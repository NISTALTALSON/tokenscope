import { ForecastResult, ScenarioEstimate, ScenarioInput, UsageAggregate } from "./types";

function round(value: number): number { return Math.round(value * 1_000_000) / 1_000_000; }

/** Forecasts future periods from daily aggregates. Cost is kept separate from token volume. */
export function forecastUsage(daily: readonly UsageAggregate[], periods: number, options: { method?: "moving-average" | "linear-trend"; window?: number; currency?: string } = {}): ForecastResult {
  if (periods < 1 || !Number.isInteger(periods)) throw new Error("periods must be a positive integer");
  const method = options.method ?? "moving-average";
  const window = Math.max(1, Math.min(options.window ?? 7, daily.length || 1));
  const values = daily.map((d) => ({ tokens: d.tokens.total, cost: d.estimatedCost.amount }));
  const recent = values.slice(-window);
  const avgTokens = recent.reduce((sum, value) => sum + value.tokens, 0) / (recent.length || 1);
  const avgCost = recent.reduce((sum, value) => sum + value.cost, 0) / (recent.length || 1);
  let tokenSlope = 0; let costSlope = 0;
  if (method === "linear-trend" && values.length > 1) {
    const meanX = (values.length - 1) / 2;
    const meanT = values.reduce((s, v) => s + v.tokens, 0) / values.length;
    const meanC = values.reduce((s, v) => s + v.cost, 0) / values.length;
    const denominator = values.reduce((s, _, i) => s + (i - meanX) ** 2, 0) || 1;
    tokenSlope = values.reduce((s, v, i) => s + (i - meanX) * (v.tokens - meanT), 0) / denominator;
    costSlope = values.reduce((s, v, i) => s + (i - meanX) * (v.cost - meanC), 0) / denominator;
  }
  const lastDate = daily.length ? new Date(`${daily[daily.length - 1].key}T00:00:00Z`) : new Date();
  const forecast = Array.from({ length: periods }, (_, index) => {
    const day = new Date(lastDate); day.setUTCDate(day.getUTCDate() + index + 1);
    const factor = values.length + index;
    return { period: day.toISOString().slice(0, 10), predictedTokens: round(Math.max(0, method === "linear-trend" ? avgTokens + tokenSlope * (factor - values.length + 1) : avgTokens)), predictedCost: round(Math.max(0, method === "linear-trend" ? avgCost + costSlope * (factor - values.length + 1) : avgCost)), currency: options.currency ?? "USD" };
  });
  return { method, periods: forecast, averageDailyTokens: round(avgTokens), averageDailyCost: round(avgCost), currency: options.currency ?? "USD" };
}

function scenarioCost(users: number, input: ScenarioInput): number {
  const requests = users * input.requestsPerUserPerDay * input.activeDaysPerMonth;
  const cachedPercent = Math.max(0, Math.min(100, input.cachedInputPercent ?? 0)) / 100;
  const regularInput = input.inputTokensPerRequest * (1 - cachedPercent);
  const cachedInput = input.inputTokensPerRequest * cachedPercent;
  const apiCost = (requests * regularInput * input.inputPerMillion + requests * cachedInput * (input.cacheInputPerMillion ?? input.inputPerMillion) + requests * input.outputTokensPerRequest * input.outputPerMillion) / 1_000_000;
  return apiCost + (input.fixedMonthlyFees ?? 0);
}

/** Calculates a scenario without mixing hypothetical spend with historical analytics. */
export function calculateScenario(input: ScenarioInput): ScenarioEstimate {
  const numeric = [input.monthlyActiveUsers, input.requestsPerUserPerDay, input.inputTokensPerRequest, input.outputTokensPerRequest, input.activeDaysPerMonth, input.inputPerMillion, input.outputPerMillion, input.cachedInputPercent ?? 0, input.cacheInputPerMillion ?? 0, input.fixedMonthlyFees ?? 0, input.growthRate ?? 0, input.budgetLimit ?? 0];
  if (numeric.some((value) => !Number.isFinite(value) || value < 0) || input.activeDaysPerMonth <= 0 || (input.cachedInputPercent ?? 0) > 100) throw new Error("Scenario values must be finite and non-negative; active days must be positive and cache percentage must be at most 100");
  const users = input.monthlyActiveUsers;
  const requestsPerDay = users * input.requestsPerUserPerDay;
  const inputTokensPerMonth = requestsPerDay * input.inputTokensPerRequest * input.activeDaysPerMonth;
  const outputTokensPerMonth = requestsPerDay * input.outputTokensPerRequest * input.activeDaysPerMonth;
  const totalTokensPerMonth = inputTokensPerMonth + outputTokensPerMonth;
  const totalCostPerMonth = scenarioCost(users, input);
  const fixedFeesPerMonth = input.fixedMonthlyFees ?? 0;
  const apiCostPerMonth = Math.max(0, totalCostPerMonth - fixedFeesPerMonth);
  const growth = Math.max(0, input.growthRate ?? 0) / 100;
  const total = (scenarioUsers: number) => scenarioCost(scenarioUsers, input);
  const estimate: ScenarioEstimate = {
    inputTokensPerMonth: round(inputTokensPerMonth),
    outputTokensPerMonth: round(outputTokensPerMonth),
    totalTokensPerMonth: round(totalTokensPerMonth),
    apiCostPerMonth: round(apiCostPerMonth),
    fixedFeesPerMonth: round(fixedFeesPerMonth),
    totalCostPerMonth: round(totalCostPerMonth),
    costPerActiveUser: round(users ? totalCostPerMonth / users : 0),
    dailyTokens: round((inputTokensPerMonth + outputTokensPerMonth) / input.activeDaysPerMonth),
    budgetHeadroom: input.budgetLimit === undefined ? undefined : round(input.budgetLimit - totalCostPerMonth),
    low: { users: Math.round(users * 0.6), totalCost: round(total(Math.round(users * 0.6))) },
    expected: { users: Math.round(users), totalCost: round(total(Math.round(users))) },
    high: { users: Math.round(users * 1.5), totalCost: round(total(Math.round(users * 1.5))) },
    milestones: [1, 10, 100, 1_000, 10_000].map((milestone) => ({ users: milestone, totalCost: round(total(milestone)) })),
    currency: input.currency ?? "USD",
  };
  // Growth is intentionally surfaced through the milestone curve rather than silently
  // changing the expected case; callers can use it for the next-month multiplier.
  if (growth > 0) estimate.milestones.push({ users: Math.round(users * (1 + growth)), totalCost: round(total(Math.round(users * (1 + growth)))) });
  return estimate;
}
