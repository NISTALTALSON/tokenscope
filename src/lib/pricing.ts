import { CostBreakdown, Money, PricingCatalog, PricingRule, UsageEvent } from "./types";
import { deriveTotalTokens } from "./usage-event";

const money = (amount: number, currency: string, kind: "actual" | "estimated", pricingVersion?: string): Money => ({
  amount: Math.round(amount * 1_000_000) / 1_000_000,
  currency,
  kind,
  pricingVersion,
});

function active(rule: PricingRule, at: string): boolean {
  return (!rule.effectiveFrom || at >= rule.effectiveFrom) && (!rule.effectiveTo || at < rule.effectiveTo);
}

/** Resolves the most specific active versioned rule for an event. */
export function resolvePricingRule(event: UsageEvent, catalog: PricingCatalog): PricingRule | undefined {
  return catalog.rules
    .filter((rule) => rule.provider.toLowerCase() === event.provider.toLowerCase() && rule.model.toLowerCase() === event.model.toLowerCase() && active(rule, event.occurredAt))
    .sort((a, b) => (b.effectiveFrom ?? "").localeCompare(a.effectiveFrom ?? ""))[0];
}

export function estimateEventCost(event: UsageEvent, rule: PricingRule): Money | undefined {
  const t = deriveTotalTokens(event.tokens);
  if (!t.inputKnown || !t.outputKnown) return undefined;
  const r = rule.rate;
  // Cache counters are subsets; use them at their cache rate and charge only the remainder at input rate.
  const cached = Math.min(t.input, (t.cachedInput ?? 0));
  const created = Math.min(Math.max(t.input - cached, 0), t.cacheCreationInput ?? 0);
  const regularInput = Math.max(t.input - cached - created, 0);
  const inputCost = regularInput * r.inputPerMillion + cached * (r.cachedInputPerMillion ?? r.inputPerMillion) + created * (r.cacheCreationInputPerMillion ?? r.inputPerMillion);
  const outputCost = t.output * r.outputPerMillion;
  return money((inputCost + outputCost) / 1_000_000, r.currency ?? "USD", "estimated", rule.version);
}

export function calculateEventCost(event: UsageEvent, catalog: PricingCatalog): CostBreakdown {
  const rule = resolvePricingRule(event, catalog);
  const estimated = rule ? estimateEventCost(event, rule) : undefined;
  return { actual: event.actualCost, estimated, pricingVersion: rule?.version, rate: rule?.rate };
}

export function addMoney(left: Money, right: Money): Money {
  if (left.currency !== right.currency) throw new Error(`Cannot add ${left.currency} and ${right.currency}`);
  return money(left.amount + right.amount, left.currency, left.kind, left.pricingVersion);
}

export const zeroMoney = (currency = "USD", kind: "actual" | "estimated" = "actual"): Money => money(0, currency, kind);
