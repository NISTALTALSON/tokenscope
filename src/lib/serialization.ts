import { UsageEvent } from "./types";

export type ExportFormat = "json" | "jsonl" | "csv";

export function serializeEvents(events: readonly UsageEvent[], format: ExportFormat, pretty = false): string {
  if (format === "json") return JSON.stringify(events, null, pretty ? 2 : 0);
  if (format === "jsonl") return events.map((event) => JSON.stringify(event)).join("\n") + (events.length ? "\n" : "");
  const headers = ["id", "occurredAt", "platform", "provider", "model", "modelVersion", "input", "output", "cachedInput", "cacheCreationInput", "reasoningOutput", "sourceReportedTotal", "requestCount", "actualCost", "currency", "costClassification", "dataAccuracy", "project", "requestId", "sourceEventId", "source"];
  const escape = (value: unknown): string => { const text = value == null ? "" : String(value); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
  const rows = events.map((e) => [e.id, e.occurredAt, e.platform, e.provider, e.model, e.modelVersion, e.tokens.input, e.tokens.output, e.tokens.cachedInput, e.tokens.cacheCreationInput, e.tokens.reasoningOutput, e.sourceReportedTotal, e.requestCount, e.actualCost?.amount, e.actualCost?.currency, e.costClassification, e.dataAccuracy, e.project, e.requestId, e.sourceEventId, e.source].map(escape).join(","));
  return [headers.join(","), ...rows].join("\n") + "\n";
}
