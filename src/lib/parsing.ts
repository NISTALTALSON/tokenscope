import { ImportResult, ParseOptions, UsageEvent, ValidationIssue } from "./types";
import { UsageEventSchema, usageEventIdentity } from "./usage-event";

function csvRows(input: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < input.length; i += 1) { const c = input[i];
    if (quoted) { if (c === '"' && input[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim()));
}

const number = (value: unknown): number | undefined => { if (value === undefined || value === null || String(value).trim() === "") return undefined; const n = Number(value); return Number.isFinite(n) ? n : undefined; };
const normalizeKey = (value: string) => value.replace(/[\s_-]+/g, "").toLowerCase();
const get = (record: Record<string, unknown>, aliases: string[]): unknown => {
  const entries = Object.entries(record);
  const keys = aliases.map(normalizeKey);
  const match = entries.find(([key, value]) => value !== undefined && keys.includes(normalizeKey(key)));
  return match?.[1];
};

function mapRecord(record: Record<string, unknown>, row: number, options: ParseOptions): { event?: UsageEvent; issues: ValidationIssue[] } {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) mapped[options.fieldMap?.[key] ?? options.fieldMap?.[normalizeKey(key)] ?? key] = value;
  const nestedTokens = mapped.tokens && typeof mapped.tokens === "object" ? mapped.tokens as Record<string, unknown> : {};
  const value = (aliases: string[]) => get(mapped, aliases) ?? get(nestedTokens, aliases);
  const occurredAt = String(value(["occurredAt", "timestamp", "date", "createdAt"]) ?? "");
  const provider = String(value(["provider"]) ?? options.defaultProvider ?? "");
  const model = String(value(["model", "modelName"]) ?? options.defaultModel ?? "");
  const input = number(value(["input", "inputTokens", "prompt_tokens", "promptTokens"]));
  const output = number(value(["output", "outputTokens", "completion_tokens", "completionTokens"]));
  const requestId = value(["requestId", "request_id"]) as string | undefined;
  const suppliedId = value(["id", "eventId"]);
  // A deterministic fallback lets identical rows be reported as duplicates rather than silently imported twice.
  const id = suppliedId === undefined || suppliedId === "" ? `${options.source ?? "import"}:${occurredAt}|${provider}|${model}|${input ?? -1}|${output ?? -1}|${requestId ?? ""}` : String(suppliedId);
  const event: UsageEvent = {
    id,
    occurredAt,
    platform: String(value(["platform", "application", "app"]) ?? "") || undefined,
    provider,
    model,
    modelVersion: String(value(["modelVersion", "model_version"]) ?? "") || undefined,
    tokens: {
      input,
      output,
      cachedInput: number(value(["cachedInput", "cacheReadTokens", "cache_read_input_tokens", "cachedInputTokens"])),
      cacheCreationInput: number(value(["cacheCreationInput", "cacheWriteTokens", "cache_creation_input_tokens", "cacheWriteInputTokens"])),
      reasoningOutput: number(value(["reasoningOutput", "reasoningTokens", "reasoning_output_tokens"])),
    },
    sourceReportedTotal: number(value(["sourceReportedTotal", "totalTokens", "total_tokens", "total"])),
    requestCount: number(value(["requestCount", "requests", "request_count"])),
    requestId,
    sourceEventId: String(value(["sourceEventId", "source_event_id", "eventId"]) ?? "") || undefined,
    project: String(value(["project", "projectName", "useCase", "use_case"]) ?? "") || undefined,
    source: options.source,
    dataAccuracy: (String(value(["dataAccuracy", "accuracy"]) ?? "") || "unknown") as UsageEvent["dataAccuracy"],
    costClassification: (String(value(["costClassification", "cost_type"]) ?? "") || undefined) as UsageEvent["costClassification"],
  };
  const nestedCost = mapped.actualCost && typeof mapped.actualCost === "object" ? mapped.actualCost as Record<string, unknown> : {};
  const actual = number(value(["actualCost", "cost", "costUsd", "cost_usd"])) ?? number(get(nestedCost, ["amount"]));
  if (actual !== undefined) {
    event.actualCost = { amount: actual, currency: String(value(["currency"]) ?? get(nestedCost, ["currency"]) ?? "USD"), kind: "actual" };
    event.costClassification = "actual_api";
  }
  const issues = UsageEventSchema.validate(event);
  return issues.length ? { issues } : { event, issues: [] };
}

export function parseUsageData(input: string, format: "csv" | "json" | "jsonl", options: ParseOptions = {}): ImportResult {
  let records: unknown[] = [];
  try {
    if (format === "csv") { const rows = csvRows(input); const headers = rows.shift() ?? []; records = rows.map((row) => Object.fromEntries(headers.map((h, i) => [h.trim(), row[i] ?? ""]))); }
    else if (format === "json") { const value: unknown = JSON.parse(input); records = Array.isArray(value) ? value : [value]; }
    else records = input.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
  } catch (error) { return { events: [], errors: [{ row: 1, issues: [{ path: "", message: `Invalid ${format}: ${error instanceof Error ? error.message : String(error)}` }] }], duplicates: [], format }; }
  const result: ImportResult = { events: [], errors: [], duplicates: [], format }; const seen = new Map<string, number>();
  records.forEach((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) { result.errors.push({ row: index + 1, issues: [{ path: "", message: "Expected an object record", value: record }], raw: record }); return; }
    const mapped = mapRecord(record as Record<string, unknown>, index + 1, options);
    if (!mapped.event) { result.errors.push({ row: index + 1, issues: mapped.issues, raw: record }); return; }
    const key = usageEventIdentity(mapped.event); if (seen.has(key)) result.duplicates.push({ row: index + 1, existingRow: seen.get(key), key }); else { seen.set(key, index + 1); result.events.push(mapped.event); }
  });
  return result;
}

export const parseCsv = (input: string, options?: ParseOptions): ImportResult => parseUsageData(input, "csv", options);
export const parseJson = (input: string, options?: ParseOptions): ImportResult => parseUsageData(input, "json", options);
export const parseJsonl = (input: string, options?: ParseOptions): ImportResult => parseUsageData(input, "jsonl", options);
