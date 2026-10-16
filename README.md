# TokenScope

**Local-first AI usage and cost intelligence for developers, founders, and small teams.**

TokenScope turns provider exports and manually recorded usage into a normalized, explainable view of token volume, requests, and cost. It is designed for teams that want useful answers without handing an analytics tool their provider passwords, prompts, or model responses.

This repository contains the working **Phase 1 MVP**. It runs in the browser, keeps its records on the device, labels estimates and demo data clearly, and makes the boundary between historical usage and hypothetical planning explicit.

## Why TokenScope?

AI usage data is often split across provider consoles, local tools, CSV exports, and one-off spreadsheets. TokenScope provides one small workspace for:

- **Seeing usage clearly:** daily trends, provider/model breakdowns, request cadence, filters, and recent activity.
- **Understanding cost confidence:** source-reported spend, catalog-based API-equivalent estimates, subscription fees, and unknown pricing remain distinct.
- **Planning responsibly:** forecasts and startup scenarios expose their assumptions instead of rewriting historical data.
- **Keeping control of data:** imports are parsed locally and stored in browser storage; Phase 1 has no cloud sync or required API key.

## Feature overview

### Analytics

- Overview KPIs for tokens, requests/events, actual API spend, and API-equivalent cost.
- Today, yesterday, last 7 days, this week, this month, last 30 days, and custom date ranges.
- Filters for platform, provider, model, project, source, data accuracy, and cost classification.
- Daily charts, provider/model rankings, recent activity, and cost-confidence labels.
- Timezone-aware date grouping and explicit handling for unknown or mixed currencies.

### Import and export

- Browser-local CSV, JSON, and JSONL imports.
- Common field aliases plus an import-time column mapping step.
- Validation preview with accepted rows, duplicate detection, and rejected-row details.
- Manual usage records for sources without a usable export.
- CSV, JSON, and JSONL exports from the selected range or workspace.

### Cost and planning

- Versioned pricing rules for API-equivalent estimates.
- Actual provider-reported cost is shown only when a source supplies it.
- Subscription fees and monthly budgets are separate from API usage.
- Moving-average and linear-trend historical forecasts.
- Saved, duplicated low/expected/high startup scenarios with editable assumptions and milestones.

### Local-first operation

- IndexedDB persistence with a localStorage fallback.
- DEMO records are visibly labelled, optional, and removable.
- No provider credentials, backend, Supabase project, or paid service is required for Phase 1.

## Preview

The repository does not currently publish a remote screenshot URL. For a GitHub preview, capture the dashboard using the clearly labelled DEMO workspace and add the image as `docs/images/dashboard.png` (do not commit personal usage data). Then replace this note with:

```md
![TokenScope dashboard](docs/images/dashboard.png)
```

## Quickstart

### Requirements

- Node.js 20 or newer
- npm 10 or newer

### Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No environment variables or API keys are required for the local MVP.

### First-use workflow

1. Open **Data Sources**.
2. Choose **Import an export** and select a CSV, JSON, or JSONL file, or download the built-in CSV template.
3. Map unfamiliar columns, review accepted/duplicate/rejected rows, and save the import.
4. Use the date range and filters to inspect the resulting analytics.
5. Export JSON, CSV, or JSONL when you need a backup or a handoff.

You can choose **Load DEMO workspace** to explore the dashboard without using real data, or **Add usage event** for a manual record. Manual records are labelled separately from verified provider reports.

## Data model and calculation rules

Every accepted row is normalized to the `UsageEvent` shape in [`src/lib/types.ts`](src/lib/types.ts). It can contain:

- provider, platform, model, model version, project, tags, connector, and source metadata;
- an event timestamp and optional timezone;
- input, output, cached-input, cache-write, and reasoning-token subsets;
- source-reported totals, request counts, stable source/event/request IDs, and import batch information;
- actual provider-reported cost with currency;
- data accuracy (`verified`, `estimated`, `manual`, `demo`, or `unknown`) and cost classification.

The calculation rules are intentionally conservative:

- A trustworthy source-reported total takes precedence; otherwise total tokens are derived from known input plus output tokens.
- Cached input and reasoning output are treated as subsets and are not counted twice.
- A missing pricing rule is reported as unknown/partial rather than as a misleading zero.
- Catalog prices are versioned and used only for API-equivalent estimates.
- Actual API spend is used only when the source reports a cost. Subscription fees remain a separate local setting.
- Currency conversion is explicit and dated; the MVP does not silently fetch exchange rates.

## Privacy boundary

TokenScope needs usage metadata, not conversation content. Do not import raw prompts or model responses. In Phase 1:

- selected files are read and parsed in the browser;
- accepted events are stored in IndexedDB under the `tokenscope` database when available, with localStorage fallback;
- there is no server-side persistence, cloud synchronization, or provider credential handling;
- clearing data in Settings deletes local records from this browser;
- exports are generated as local downloads, so keep exported files private and back them up intentionally.

The app cannot change the privacy characteristics of a file you choose to import. Review provider exports before importing them and avoid files containing prompts, responses, secrets, or unrelated personal data.

## Integrations: supported vs planned

TokenScope currently supports **file-based ingestion**, not live provider connections.

| Capability | Status | Notes |
| --- | --- | --- |
| CSV import | Supported | Alias mapping, validation, duplicate detection, and template download |
| JSON import | Supported | One record or an array of records |
| JSONL import | Supported | One non-empty JSON object per line |
| Manual usage records | Supported | Required provider, model, timestamp, input, and output fields |
| CSV/JSON/JSONL export | Supported | Uses the normalized local records and selected filters/range |
| OpenAI organization usage/cost API | Planned | No credentials or live connection is implemented |
| Anthropic Console usage/cost API | Planned | Adapter requirements still need verification |
| LiteLLM reports | Planned | Import/adapter contract is not enabled yet |
| Claude Code, Codex CLI, and Gemini CLI collectors | Planned | Local formats and permissions need a deliberate adapter design |
| Supabase/PostgreSQL sync and team workspaces | Planned | Would require server-side credentials, authorization, and RLS |
| OpenTelemetry, browser capture, scheduled sync, and notifications | Planned | Future ingestion and workflow work |

Provider/model names in the pricing catalog are not live integrations. A consumer ChatGPT or Claude subscription is not inferred from an API key or a model name.

## Project structure

```text
app/
  page.tsx                 # App Router entry point
  layout.tsx               # Metadata and global styles
  globals.css              # Base visual system
  overrides.css            # TokenScope-specific responsive additions
src/
  components/
    TokenScopeApp.tsx      # Dashboard and user workflows
  lib/
    types.ts               # Canonical domain types
    usage-event.ts         # Validation, normalization, and identity
    parsing.ts             # CSV/JSON/JSONL ingestion
    repository.ts           # IndexedDB/localStorage/memory persistence
    analytics.ts            # Timezone-aware aggregation
    pricing.ts              # Versioned cost calculations
    forecasting.ts          # Historical and scenario forecasts
    currency.ts             # Explicit exchange-rate conversion
    serialization.ts        # CSV/JSON/JSONL exports
tests/
  domain.test.ts           # Domain behavior and fixtures
  app-smoke.test.tsx       # Basic application smoke coverage
```

The repository layer is deliberately replaceable: `UsageEventRepository` has memory, localStorage, and IndexedDB implementations so a future synchronization layer does not have to couple the UI to one database vendor.

## Development checks

Run these commands from the repository root before opening a pull request:

```bash
npm run typecheck
npm test
npm run build
```

`npm test` runs the Vitest suite. The build performs the Next.js production compilation and type validation. The GitHub Actions workflow runs all three checks on pushes and pull requests.

## Deployment

Phase 1 has no required environment variables and no required backend. Build and run the standard Next.js production application with:

```bash
npm run build
npm start
```

It can be deployed to a Next.js-compatible host. Because records live in browser storage, deployment does not create shared cloud storage or cross-device synchronization. A future cloud deployment must add server-side credentials, authorization, import/error records, pricing rules, budgets, scenarios, preferences, synchronization checkpoints, and Row Level Security before advertising team or cross-device storage.

## Roadmap

### Current: Phase 1 MVP

Local persistence, normalized file imports, manual records, analytics, transparent pricing, exports, forecasts, scenarios, DEMO data, and domain tests.

### Next: Phase 2 candidates

Verified provider and local-tool adapters, an explicit sync boundary, authenticated cloud storage, team workspaces, and durable import history.

### Later candidates

OpenTelemetry ingestion, browser-extension capture, scheduled synchronization, notifications, and richer collaboration workflows.

Roadmap items are directional. An integration should only move to supported after its source format, access requirements, error handling, and privacy implications are verified.

## Contributing

Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) before making changes. In brief:

1. Keep changes focused and explain the user outcome.
2. Preserve the distinction between actual, estimated, subscription, demo, and unknown data.
3. Do not add provider credentials, raw prompts/responses, generated build output, or personal exports.
4. Update documentation when behavior or support status changes.
5. Run typecheck, tests, and the production build before submitting a pull request.

## License

TokenScope is released under the [MIT License](LICENSE).
