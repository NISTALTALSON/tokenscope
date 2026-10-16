/** Shared, UI-independent domain types for TokenScope. */

export type CostKind = "actual" | "estimated";
export type DataAccuracy = "verified" | "estimated" | "manual" | "demo" | "unknown";
export type CostClassification = "actual_api" | "estimated_api_equivalent" | "subscription" | "unknown";

export interface TokenUsage {
  /** Prompt tokens. Cache fields are informational subsets of this value. */
  input?: number;
  /** Completion tokens. Reasoning fields are informational subsets of this value. */
  output?: number;
  cachedInput?: number;
  cacheCreationInput?: number;
  reasoningOutput?: number;
}

export interface UsageEvent {
  /** Stable source id when available, otherwise a deterministic import id. */
  id: string;
  occurredAt: string;
  /** Optional platform/application name, distinct from the provider. */
  platform?: string;
  timezone?: string;
  provider: string;
  model: string;
  modelVersion?: string;
  tokens: TokenUsage;
  /** A trustworthy source-reported total takes precedence over derived input + output. */
  sourceReportedTotal?: number;
  requestCount?: number;
  /** A provider-reported price, if one was recorded with the event. */
  actualCost?: Money;
  costClassification?: CostClassification;
  dataAccuracy?: DataAccuracy;
  project?: string;
  tags?: string[];
  connector?: string;
  importBatchId?: string;
  sourceEventId?: string;
  ingestedAt?: string;
  requestId?: string;
  source?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface Money {
  amount: number;
  currency: string;
  kind: CostKind;
  pricingVersion?: string;
}

export interface DerivedTokenUsage extends TokenUsage {
  input: number;
  output: number;
  total: number;
  inputKnown: boolean;
  outputKnown: boolean;
  totalKnown: boolean;
}

export interface ValidationIssue {
  path: string;
  message: string;
  value?: unknown;
}

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  issues: ValidationIssue[];
}

export interface PricingRate {
  /** USD (or the rule currency) per one million tokens. */
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion?: number;
  cacheCreationInputPerMillion?: number;
  currency?: string;
}

export interface PricingRule {
  provider: string;
  model: string;
  version: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  rate: PricingRate;
}

export interface PricingCatalog {
  version: string;
  rules: PricingRule[];
}

export interface CostBreakdown {
  actual?: Money;
  estimated?: Money;
  pricingVersion?: string;
  rate?: PricingRate;
}

export interface AnalyticsRange {
  /** ISO instant or a date interpreted at midnight in timeZone. */
  start: string;
  /** Exclusive end instant or date interpreted at midnight in timeZone. */
  end: string;
  timeZone: string;
}

export interface UsageAggregate {
  key: string;
  events: number;
  tokens: DerivedTokenUsage;
  actualCost: Money;
  estimatedCost: Money;
  requests: number;
  actualCostEvents: number;
  unknownCostEvents: number;
  mixedCurrencies: boolean;
  unknownInputEvents: number;
  unknownOutputEvents: number;
  unknownTotalEvents: number;
}

export interface AnalyticsSummary {
  range: AnalyticsRange;
  events: number;
  tokens: DerivedTokenUsage;
  actualCost: Money;
  estimatedCost: Money;
  requests: number;
  actualCostEvents: number;
  unknownCostEvents: number;
  mixedCurrencies: boolean;
  unknownInputEvents: number;
  unknownOutputEvents: number;
  unknownTotalEvents: number;
  byDay: UsageAggregate[];
  byModel: UsageAggregate[];
  byProvider: UsageAggregate[];
}

export interface ForecastPoint {
  period: string;
  predictedTokens: number;
  predictedCost: number;
  currency: string;
}

export interface ForecastResult {
  method: "moving-average" | "linear-trend";
  periods: ForecastPoint[];
  averageDailyTokens: number;
  averageDailyCost: number;
  currency: string;
}

export interface ScenarioInput {
  name: string;
  monthlyActiveUsers: number;
  requestsPerUserPerDay: number;
  inputTokensPerRequest: number;
  outputTokensPerRequest: number;
  cachedInputPercent?: number;
  activeDaysPerMonth: number;
  inputPerMillion: number;
  outputPerMillion: number;
  cacheInputPerMillion?: number;
  fixedMonthlyFees?: number;
  growthRate?: number;
  budgetLimit?: number;
  currency?: string;
}

export interface ScenarioEstimate {
  inputTokensPerMonth: number;
  outputTokensPerMonth: number;
  totalTokensPerMonth: number;
  apiCostPerMonth: number;
  fixedFeesPerMonth: number;
  totalCostPerMonth: number;
  costPerActiveUser: number;
  dailyTokens: number;
  budgetHeadroom?: number;
  low: { users: number; totalCost: number };
  expected: { users: number; totalCost: number };
  high: { users: number; totalCost: number };
  milestones: Array<{ users: number; totalCost: number }>;
  currency: string;
}

export interface ParseOptions {
  source?: string;
  defaultProvider?: string;
  defaultModel?: string;
  /** Field aliases can be supplied for a provider-specific export. */
  fieldMap?: Record<string, string>;
}

export interface ImportError {
  row: number;
  issues: ValidationIssue[];
  raw?: unknown;
}

export interface ImportResult {
  events: UsageEvent[];
  errors: ImportError[];
  duplicates: Array<{ row: number; existingRow?: number; key: string }>;
  format: "csv" | "json" | "jsonl";
}

export interface UsageEventRepository {
  put(event: UsageEvent): Promise<void>;
  putMany(events: readonly UsageEvent[]): Promise<void>;
  get(id: string): Promise<UsageEvent | undefined>;
  getAll(): Promise<UsageEvent[]>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
  query(range?: { start?: string; end?: string }): Promise<UsageEvent[]>;
}
