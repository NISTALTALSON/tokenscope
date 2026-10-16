import { DerivedTokenUsage, TokenUsage, UsageEvent, ValidationIssue, ValidationResult } from "./types";

const finiteNonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/**
 * Derives totals without double counting provider subset fields:
 * cached input is part of input, and reasoning output is part of output.
 */
export function deriveTotalTokens(tokens: TokenUsage, sourceReportedTotal?: number): DerivedTokenUsage {
  const inputKnown = finiteNonNegative(tokens.input);
  const outputKnown = finiteNonNegative(tokens.output);
  const totalKnown = finiteNonNegative(sourceReportedTotal) || (inputKnown && outputKnown);
  const input = inputKnown ? tokens.input! : 0;
  const output = outputKnown ? tokens.output! : 0;
  return { ...tokens, input, output, total: finiteNonNegative(sourceReportedTotal) ? sourceReportedTotal! : input + output, inputKnown, outputKnown, totalKnown };
}

export const UsageEventSchema = {
  validate(value: unknown): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return [{ path: "", message: "Expected an object", value }];
    }
    const record = value as Record<string, unknown>;
    for (const field of ["id", "occurredAt", "provider", "model"]) {
      if (typeof record[field] !== "string" || !(record[field] as string).trim()) {
        issues.push({ path: field, message: "Expected a non-empty string", value: record[field] });
      }
    }
    for (const field of ["requestId", "source", "platform", "timezone", "modelVersion", "project", "connector", "importBatchId", "sourceEventId", "ingestedAt"]) {
      if (record[field] !== undefined && typeof record[field] !== "string") {
        issues.push({ path: field, message: "Expected a string when provided", value: record[field] });
      }
    }
    if (typeof record.occurredAt === "string" && Number.isNaN(Date.parse(record.occurredAt))) {
      issues.push({ path: "occurredAt", message: "Expected a valid ISO date", value: record.occurredAt });
    }
    const tokens = record.tokens;
    if (!tokens || typeof tokens !== "object" || Array.isArray(tokens)) {
      issues.push({ path: "tokens", message: "Expected token counts object", value: tokens });
    } else {
      const t = tokens as Record<string, unknown>;
      for (const field of ["input", "output"]) {
        if (t[field] !== undefined && !finiteNonNegative(t[field])) {
          issues.push({ path: `tokens.${field}`, message: "Expected a finite non-negative number", value: t[field] });
        }
      }
      for (const field of ["cachedInput", "cacheCreationInput", "reasoningOutput"]) {
        if (t[field] !== undefined && !finiteNonNegative(t[field])) {
          issues.push({ path: `tokens.${field}`, message: "Expected a finite non-negative number", value: t[field] });
        }
      }
      if (t.input === undefined && t.output === undefined && !finiteNonNegative(record.sourceReportedTotal)) {
        issues.push({ path: "tokens", message: "At least one token component or source-reported total is required", value: tokens });
      }
    }
    if (record.sourceReportedTotal !== undefined && !finiteNonNegative(record.sourceReportedTotal)) {
      issues.push({ path: "sourceReportedTotal", message: "Expected a finite non-negative number", value: record.sourceReportedTotal });
    }
    if (record.requestCount !== undefined && !finiteNonNegative(record.requestCount)) {
      issues.push({ path: "requestCount", message: "Expected a finite non-negative number", value: record.requestCount });
    }
    if (record.tags !== undefined && (!Array.isArray(record.tags) || record.tags.some((tag) => typeof tag !== "string"))) {
      issues.push({ path: "tags", message: "Expected an array of strings when provided", value: record.tags });
    }
    if (record.actualCost !== undefined) {
      const cost = record.actualCost;
      if (!cost || typeof cost !== "object" || Array.isArray(cost)) {
        issues.push({ path: "actualCost", message: "Expected a money object", value: cost });
      } else {
        const c = cost as Record<string, unknown>;
        if (!finiteNonNegative(c.amount)) issues.push({ path: "actualCost.amount", message: "Expected a non-negative number", value: c.amount });
        if (typeof c.currency !== "string" || !c.currency) issues.push({ path: "actualCost.currency", message: "Expected a currency", value: c.currency });
        if (c.kind !== "actual") issues.push({ path: "actualCost.kind", message: "Provider-reported cost must be actual", value: c.kind });
      }
    }
    return issues;
  },
  safeParse(value: unknown): ValidationResult<UsageEvent> {
    const issues = this.validate(value);
    return issues.length ? { success: false, issues } : { success: true, data: value as UsageEvent, issues: [] };
  },
  parse(value: unknown): UsageEvent {
    const result = this.safeParse(value);
    if (!result.success) throw new Error(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    return result.data as UsageEvent;
  },
};

export function createUsageEvent(input: Omit<UsageEvent, "occurredAt"> & { occurredAt: string | Date }): UsageEvent {
  const event: UsageEvent = { ...input, occurredAt: new Date(input.occurredAt).toISOString(), ingestedAt: input.ingestedAt ?? new Date().toISOString() };
  UsageEventSchema.parse(event);
  return event;
}

/** A stable key used for duplicate detection during imports. */
export function usageEventIdentity(event: UsageEvent): string {
  return event.sourceEventId || event.requestId || event.id || [event.occurredAt, event.platform ?? "", event.provider, event.model, event.tokens.input ?? "", event.tokens.output ?? "", event.sourceReportedTotal ?? ""].join("|");
}
