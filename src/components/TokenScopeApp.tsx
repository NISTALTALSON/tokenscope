"use client";

import {
  Activity,
  AlertCircle,
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  Bell,
  Boxes,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  Database,
  Download,
  FileJson,
  FileText,
  Github,
  History,
  Home,
  Info,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  TrendingUp,
  Upload,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  aggregateUsage,
  calculateEventCost,
  calculateScenario,
  createClientUsageEventRepository,
  createUsageEvent,
  deriveTotalTokens,
  forecastUsage,
  LocalStorageUsageEventRepository,
  MemoryUsageEventRepository,
  normalizeRange,
  parseUsageData,
  serializeEvents,
  type AnalyticsSummary,
  type ForecastResult,
  type ImportResult,
  type PricingCatalog,
  type ScenarioEstimate,
  type ScenarioInput,
  type UsageEvent,
  type UsageEventRepository,
} from "../lib";

type View = "overview" | "usage" | "platforms" | "cost" | "planner" | "sources" | "history" | "settings";
type Theme = "dark" | "light";
type ToastTone = "success" | "error" | "info";
type Toast = { id: number; text: string; tone: ToastTone };
type RangePreset = "today" | "yesterday" | "last7" | "thisWeek" | "thisMonth" | "last30" | "custom";
type FilterState = { platform: string; provider: string; model: string; project: string; accuracy: string; costClassification: string; source: string };
type FilterOptions = { platforms: string[]; providers: string[]; models: string[]; projects: string[]; sources: string[] };

const NAV: Array<{ id: View; label: string; icon: LucideIcon; badge?: string }> = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "usage", label: "Usage Analytics", icon: BarChart3 },
  { id: "platforms", label: "Platforms & Models", icon: Boxes },
  { id: "cost", label: "Cost Intelligence", icon: CircleDollarSign },
  { id: "planner", label: "Startup Planner", icon: TrendingUp },
  { id: "sources", label: "Data Sources", icon: Database },
  { id: "history", label: "Import History", icon: History, badge: "LOCAL" },
  { id: "settings", label: "Settings", icon: Settings },
];

const CATALOG: PricingCatalog = {
  version: "tokenscope-2026.01",
  rules: [
    { provider: "OpenAI", model: "gpt-4o", version: "2024-05", rate: { inputPerMillion: 5, outputPerMillion: 15 } },
    { provider: "OpenAI", model: "gpt-4o-mini", version: "2024-07", rate: { inputPerMillion: 0.15, outputPerMillion: 0.6 } },
    { provider: "OpenAI", model: "gpt-4.1", version: "2025-04", rate: { inputPerMillion: 2, outputPerMillion: 8 } },
    { provider: "Anthropic", model: "claude-3-5-sonnet", version: "2024-06", rate: { inputPerMillion: 3, outputPerMillion: 15 } },
    { provider: "Anthropic", model: "claude-3-5-haiku", version: "2024-10", rate: { inputPerMillion: 0.8, outputPerMillion: 4 } },
    { provider: "Google", model: "gemini-1.5-pro", version: "2024-05", rate: { inputPerMillion: 3.5, outputPerMillion: 10.5 } },
    { provider: "Google", model: "gemini-2.0-flash", version: "2025-01", rate: { inputPerMillion: 0.1, outputPerMillion: 0.4 } },
  ],
};

const CHART_COLORS = ["#8b5cf6", "#22d3ee", "#f59e0b", "#45d39a", "#ef8f9a", "#6f8ef7"];
const fmtTokens = (value: number) => value >= 1e9 ? `${(value / 1e9).toFixed(1)}B` : value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(1)}K` : Math.round(value).toLocaleString();
const fmtMoney = (value: number, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: value !== 0 && Math.abs(value) < 0.01 ? 4 : 2 }).format(value);
const isoDate = (date: Date) => { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0"); return `${year}-${month}-${day}`; };
const shiftDate = (value: string, amount: number) => { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + amount); return isoDate(date); };
const todayDate = () => isoDate(new Date());
const startDateDefault = () => shiftDate(todayDate(), -29);
const safeNumber = (value: unknown, fallback = 0) => { if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return fallback; const number = Number(value); return Number.isFinite(number) ? number : fallback; };

function rangeForPreset(preset: Exclude<RangePreset, "custom">): { start: string; end: string } {
  const today = todayDate();
  if (preset === "today") return { start: today, end: today };
  if (preset === "yesterday") { const yesterday = shiftDate(today, -1); return { start: yesterday, end: yesterday }; }
  if (preset === "last7") return { start: shiftDate(today, -6), end: today };
  if (preset === "last30") return { start: shiftDate(today, -29), end: today };
  if (preset === "thisWeek") {
    const date = new Date(`${today}T12:00:00`);
    const mondayOffset = (date.getDay() + 6) % 7;
    return { start: shiftDate(today, -mondayOffset), end: today };
  }
  return { start: `${today.slice(0, 7)}-01`, end: today };
}

function makeDemoEvents(): UsageEvent[] {
  const models = [["OpenAI", "gpt-4o-mini"], ["Anthropic", "claude-3-5-sonnet"], ["OpenAI", "gpt-4o"], ["Google", "gemini-2.0-flash"]];
  return Array.from({ length: 30 }, (_, index) => {
    const [provider, model] = models[index % models.length];
    const input = 2_100 + (index * 683) % 10_500;
    const output = 420 + (index * 219) % 3_800;
    return createUsageEvent({
      id: `demo-${index}`,
      occurredAt: `${shiftDate(todayDate(), -(29 - index))}T${String(8 + (index % 10)).padStart(2, "0")}:15:00`,
      platform: index % 2 ? "Claude Code" : "API workspace",
      provider,
      model,
      tokens: { input, output, cachedInput: index % 3 === 0 ? Math.floor(input * 0.3) : undefined },
      project: index % 2 ? "Atlas launch" : "Internal tools",
      source: "demo",
      dataAccuracy: "demo",
      costClassification: "estimated_api_equivalent",
    });
  });
}

function dataRangeEvents(events: readonly UsageEvent[], start: string, end: string, timeZone: string): UsageEvent[] {
  const normalized = normalizeRange({ start, end: shiftDate(end, 1), timeZone });
  const lower = Date.parse(normalized.start);
  const upper = Date.parse(normalized.end);
  return events.filter((event) => { const time = Date.parse(event.occurredAt); return time >= lower && time < upper; });
}

function Tag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "purple" | "green" | "amber" | "blue" }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

function displayCost(summary: AnalyticsSummary, kind: "actual" | "estimated"): string {
  if (summary.mixedCurrencies) return "Mixed currencies";
  if (kind === "actual") return summary.actualCostEvents ? fmtMoney(summary.actualCost.amount, summary.actualCost.currency) : "Unknown";
  if (!summary.events || summary.unknownCostEvents >= summary.events) return "Unknown";
  return `${summary.unknownCostEvents ? "~" : ""}${fmtMoney(summary.estimatedCost.amount, summary.estimatedCost.currency)}`;
}

async function resolveWorkspaceRepository(): Promise<{ repository: UsageEventRepository; events: UsageEvent[]; warning?: string }> {
  const candidates: Array<{ repository: UsageEventRepository; warning: string }> = [];
  try {
    candidates.push({ repository: createClientUsageEventRepository(), warning: "IndexedDB was unavailable, so TokenScope is using browser-local storage." });
  } catch {
    // Some privacy modes expose the IndexedDB global but throw when it is opened.
  }
  try {
    candidates.push({ repository: new LocalStorageUsageEventRepository(), warning: "IndexedDB was unavailable, so TokenScope is using browser-local storage." });
  } catch {
    // Continue to an in-memory repository so a blocked browser storage API never leaves the UI at boot.
  }
  candidates.push({ repository: new MemoryUsageEventRepository(), warning: "Browser storage is unavailable; this session will not persist after refresh." });

  for (const [index, candidate] of candidates.entries()) {
    try {
      const events = await Promise.race([
        candidate.repository.getAll(),
        new Promise<UsageEvent[]>((_, reject) => window.setTimeout(() => reject(new Error("Storage initialization timed out")), 1500)),
      ]);
      return { repository: candidate.repository, events, warning: index === 0 ? undefined : candidate.warning };
    } catch {
      // Try the next storage implementation.
    }
  }
  return { repository: new MemoryUsageEventRepository(), events: [], warning: "Usage storage could not be opened; this session will not persist after refresh." };
}

export default function TokenScopeApp() {
  const [view, setView] = useState<View>("overview");
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [repository, setRepository] = useState<UsageEventRepository | null>(null);
  const [ready, setReady] = useState(false);
  const [bootTimedOut, setBootTimedOut] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [preset, setPreset] = useState<RangePreset>("last30");
  const [rangeStart, setRangeStart] = useState(startDateDefault);
  const [rangeEnd, setRangeEnd] = useState(todayDate);
  const [filters, setFilters] = useState<FilterState>({ platform: "all", provider: "all", model: "all", project: "all", accuracy: "all", costClassification: "all", source: "all" });
  const [query, setQuery] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [demo, setDemo] = useState(false);
  const [subscriptionFee, setSubscriptionFee] = useState(0);
  const [monthlyBudget, setMonthlyBudget] = useState(100);
  const initializationClaimed = useRef(false);

  const notify = useCallback((text: string, tone: ToastTone = "success") => {
    const id = Date.now() + Math.round(Math.random() * 1000);
    setToasts((current) => [...current, { id, text, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4500);
  }, []);

  const refresh = useCallback(async (repo: UsageEventRepository) => {
    const all = await repo.getAll();
    setEvents(all);
    setDemo(all.some((event) => event.source === "demo"));
  }, []);

  useEffect(() => {
    let active = true;
    void resolveWorkspaceRepository().then(({ repository: resolvedRepository, events: storedEvents, warning }) => {
      if (!active || initializationClaimed.current) return;
      initializationClaimed.current = true;
      setRepository(resolvedRepository);
      setEvents(storedEvents);
      setDemo(storedEvents.some((event) => event.source === "demo"));
      setReady(true);
      if (warning) notify(warning, "info");
    }).catch(() => {
      if (!active || initializationClaimed.current) return;
      initializationClaimed.current = true;
      setRepository(new MemoryUsageEventRepository());
      setEvents([]);
      setReady(true);
      notify("Usage storage could not be opened; the dashboard is running in session-only mode.", "error");
    });
    try {
      const storedTheme = window.localStorage.getItem("tokenscope:theme") as Theme | null;
      if (storedTheme === "light" || storedTheme === "dark") setTheme(storedTheme);
      setSubscriptionFee(safeNumber(window.localStorage.getItem("tokenscope:subscription-fee")));
      setMonthlyBudget(safeNumber(window.localStorage.getItem("tokenscope:monthly-budget"), 100));
    } catch {
      // Storage preferences are optional; analytics should still render.
    }
    return () => { active = false; };
  }, [notify, refresh]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setBootTimedOut(true), 2500);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    try { window.localStorage.setItem("tokenscope:theme", theme); } catch { /* preferences are optional */ }
  }, [theme]);

  useEffect(() => { try { window.localStorage.setItem("tokenscope:subscription-fee", String(subscriptionFee)); } catch { /* preferences are optional */ } }, [subscriptionFee]);
  useEffect(() => { try { window.localStorage.setItem("tokenscope:monthly-budget", String(monthlyBudget)); } catch { /* preferences are optional */ } }, [monthlyBudget]);

  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const range = useMemo(() => ({ start: rangeStart, end: shiftDate(rangeEnd, 1), timeZone }), [rangeEnd, rangeStart, timeZone]);
  const matchingEvents = useMemo(() => events.filter((event) => {
    const text = `${event.provider} ${event.model} ${event.platform ?? ""} ${event.project ?? ""} ${event.source ?? ""}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase()))
      && (filters.platform === "all" || event.platform === filters.platform)
      && (filters.provider === "all" || event.provider === filters.provider)
      && (filters.model === "all" || event.model === filters.model)
      && (filters.project === "all" || event.project === filters.project)
      && (filters.accuracy === "all" || event.dataAccuracy === filters.accuracy)
      && (filters.costClassification === "all" || event.costClassification === filters.costClassification)
      && (filters.source === "all" || (event.source ?? "manual") === filters.source);
  }), [events, filters, query]);
  const summary = useMemo(() => {
    try { return aggregateUsage(matchingEvents, range, CATALOG); }
    catch { return aggregateUsage([], { start: todayDate(), end: shiftDate(todayDate(), 1), timeZone }, CATALOG); }
  }, [matchingEvents, range, timeZone]);
  const inRangeEvents = useMemo(() => { try { return dataRangeEvents(matchingEvents, rangeStart, rangeEnd, timeZone).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)); } catch { return []; } }, [matchingEvents, rangeEnd, rangeStart, timeZone]);
  const options = useMemo(() => ({
    platforms: [...new Set(events.map((event) => event.platform).filter(Boolean))] as string[],
    providers: [...new Set(events.map((event) => event.provider))],
    models: [...new Set(events.map((event) => event.model))],
    projects: [...new Set(events.map((event) => event.project).filter(Boolean))] as string[],
    sources: [...new Set(events.map((event) => event.source ?? "manual"))],
  }), [events]);

  const navigate = (next: View) => { setView(next); setMobileNav(false); };
  const saveEvents = async (incoming: UsageEvent[], message: string) => {
    if (!repository) return;
    try { await repository.putMany(incoming); await refresh(repository); notify(message); } catch { notify("The records could not be saved locally.", "error"); }
  };
  const loadDemo = () => { void saveEvents(makeDemoEvents(), "DEMO records added — remove them any time in Settings."); };
  const removeDemo = async () => {
    if (!repository) return;
    await Promise.all(events.filter((event) => event.source === "demo").map((event) => repository.delete(event.id)));
    await refresh(repository);
    notify("DEMO records removed.", "info");
  };
  const clearAll = async () => {
    if (!repository || !window.confirm("Delete every stored usage event? This cannot be undone.")) return;
    await repository.clear(); await refresh(repository); notify("All local usage data was deleted.", "info");
  };
  const removeEvent = async (id: string) => {
    if (!repository || !window.confirm("Delete this usage event?")) return;
    await repository.delete(id); await refresh(repository); notify("Usage event deleted.", "info");
  };
  const exportEvents = (format: "csv" | "json" | "jsonl") => {
    const body = serializeEvents(inRangeEvents, format, true);
    const blob = new Blob([body], { type: format === "csv" ? "text/csv" : "application/json" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `tokenscope-${rangeStart}-to-${rangeEnd}.${format}`; link.click(); URL.revokeObjectURL(link.href);
    notify(`Exported ${inRangeEvents.length} records as ${format.toUpperCase()}.`);
  };
  const updatePreset = (next: RangePreset) => { setPreset(next); if (next !== "custom") { const dates = rangeForPreset(next); setRangeStart(dates.start); setRangeEnd(dates.end); } };

  if (!ready) return <div className="boot"><div className="boot-card"><div className="brand-dot"><Zap size={19} /></div><span>{bootTimedOut ? "Browser storage is taking longer than expected." : "Opening your local workspace…"}</span>{bootTimedOut && <><small>Continue in session mode to use the dashboard without saved records.</small><button className="button button-primary" onClick={() => { initializationClaimed.current = true; setRepository(new MemoryUsageEventRepository()); setEvents([]); setReady(true); notify("Running in session-only mode; records will not persist after refresh.", "info"); }}>Continue without storage</button></>}</div></div>;

  return <div className="app-shell">
    <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileNav ? "mobile-open" : ""}`}>
      <div className="sidebar-head"><div className="logo"><span className="logo-symbol"><Zap size={18} fill="currentColor" /></span>{!collapsed && <span>Token<span className="logo-accent">Scope</span></span>}</div><button className="icon-button sidebar-toggle" onClick={() => setCollapsed((value) => !value)} aria-label="Toggle sidebar">{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button></div>
      <div className="workspace-switch"><div className="workspace-avatar">A</div>{!collapsed && <><div className="workspace-copy"><strong>Acme workspace</strong><small>Local plan · {timeZone}</small></div><ChevronDown size={14} className="muted" /></>}</div>
      <nav className="nav-list" aria-label="Main navigation">{NAV.map(({ id, label, icon: Icon, badge }) => <button key={id} className={`nav-item ${view === id ? "active" : ""}`} onClick={() => navigate(id)} title={collapsed ? label : undefined}><Icon size={18} /><span>{!collapsed && label}</span>{!collapsed && badge && <Tag tone="purple">{badge}</Tag>}</button>)}</nav>
      {!collapsed && <div className="sidebar-bottom"><div className="privacy-card"><div className="privacy-head"><span className="shield-mark">✓</span><span>Local-first privacy</span></div><p>No prompts, responses, or provider secrets leave this browser in Phase 1.</p></div><button className="nav-item" onClick={() => navigate("settings")}><Info size={17} /><span>About TokenScope</span></button></div>}
    </aside>
    {mobileNav && <button className="scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
    <main className="main-shell">
      <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={21} /></button><div className="breadcrumbs"><span>Workspace</span><span>/</span><strong>{NAV.find((item) => item.id === view)?.label}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Notifications"><Bell size={18} /><i className="notification-dot" /></button><div className="avatar">AR</div></div></header>
      <div className="page-content">
        {view === "overview" && <OverviewView summary={summary} events={inRangeEvents} demo={demo} preset={preset} start={rangeStart} end={rangeEnd} onPreset={updatePreset} onStart={(value) => { setPreset("custom"); setRangeStart(value); }} onEnd={(value) => { setPreset("custom"); setRangeEnd(value); }} onDemo={loadDemo} onImport={() => setShowImport(true)} onManual={() => setShowManual(true)} onExport={() => exportEvents("csv")} onRemoveDemo={() => void removeDemo()} />}
        {view === "usage" && <UsageView summary={summary} events={inRangeEvents} options={options} filters={filters} setFilters={setFilters} />}
        {view === "platforms" && <PlatformsView summary={summary} events={inRangeEvents} onImport={() => setShowImport(true)} />}
        {view === "cost" && <CostView summary={summary} subscriptionFee={subscriptionFee} budget={monthlyBudget} onSubscription={setSubscriptionFee} onBudget={setMonthlyBudget} />}
        {view === "planner" && <PlannerView summary={summary} />}
        {view === "sources" && <SourcesView onImport={() => setShowImport(true)} onManual={() => setShowManual(true)} onDemo={loadDemo} />}
        {view === "history" && <HistoryView events={events} inRangeEvents={inRangeEvents} query={query} setQuery={setQuery} onExport={exportEvents} onClear={() => void clearAll()} onDelete={(id) => void removeEvent(id)} />}
        {view === "settings" && <SettingsView theme={theme} setTheme={setTheme} demo={demo} onRemoveDemo={() => void removeDemo()} onClear={() => void clearAll()} onExport={() => exportEvents("json")} />}
      </div>
    </main>
    <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <ToastItem key={toast.id} toast={toast} onDismiss={() => setToasts((current) => current.filter((item) => item.id !== toast.id))} />)}</div>
    {showImport && <ImportModal onClose={() => setShowImport(false)} onImported={async (incoming, message) => { await saveEvents(incoming, message); setShowImport(false); }} />}
    {showManual && <ManualModal onClose={() => setShowManual(false)} onSaved={async (event) => { await saveEvents([event], "Manual record saved."); setShowManual(false); }} />}
  </div>;
}

function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return <div className="page-header"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="header-actions">{actions}</div>}</div>;
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon = toast.tone === "error" ? AlertCircle : toast.tone === "info" ? Info : Check;
  return <div className={`toast toast-${toast.tone}`}><Icon size={17} /><span>{toast.text}</span><button onClick={onDismiss} aria-label="Dismiss notification"><X size={14} /></button></div>;
}

function DateControls({ preset, start, end, onPreset, onStart, onEnd }: { preset: RangePreset; start: string; end: string; onPreset: (value: RangePreset) => void; onStart: (value: string) => void; onEnd: (value: string) => void }) {
  return <div className="date-controls"><select className="select-control" value={preset} onChange={(event) => onPreset(event.target.value as RangePreset)} aria-label="Date range preset"><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="last7">Last 7 days</option><option value="thisWeek">This week</option><option value="thisMonth">This month</option><option value="last30">Last 30 days</option><option value="custom">Custom range</option></select><div className="date-range"><CalendarDays size={15} /><input type="date" value={start} onChange={(event) => onStart(event.target.value)} aria-label="Start date" /><span>to</span><input type="date" value={end} onChange={(event) => onEnd(event.target.value)} aria-label="End date" /></div></div>;
}

function KpiCard({ label, value, foot, icon: Icon, accent, tone }: { label: string; value: string; foot: string; icon: LucideIcon; accent: string; tone?: "positive" | "neutral" }) {
  return <div className="kpi-card"><div className="kpi-top"><span>{label}</span><span className={`kpi-icon ${accent}`}><Icon size={17} /></span></div><strong>{value}</strong><div className={`kpi-foot ${tone === "positive" ? "kpi-positive" : ""}`}><span>{foot}</span></div></div>;
}

function PanelTitle({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return <div className="panel-title"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{children}</div>;
}

function ChartTip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey?: string; value?: number; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tip"><span>{label}</span>{payload.map((item) => <strong key={String(item.dataKey)} style={{ color: item.color }}>{item.dataKey?.toLowerCase().includes("cost") ? fmtMoney(Number(item.value ?? 0)) : fmtTokens(Number(item.value ?? 0))}</strong>)}</div>;
}

function EmptyState({ onDemo, onImport, onManual }: { onDemo: () => void; onImport: () => void; onManual: () => void }) {
  return <div className="empty-state animate-in"><div className="empty-icon"><Sparkles size={25} /></div><h2>Make your usage visible</h2><p>Import an export, add a manual record, or explore with clearly labelled DEMO data. Nothing is uploaded by this local-first workspace.</p><div className="empty-actions"><button className="button button-primary" onClick={onImport}><Upload size={16} /> Import usage</button><button className="button button-secondary" onClick={onManual}><Plus size={16} /> Add record</button><button className="button button-ghost" onClick={onDemo}><Sparkles size={16} /> Load DEMO</button></div><div className="empty-note"><span className="shield-mark">✓</span> No API keys or paid services required.</div></div>;
}

function OverviewView({ summary, events, demo, preset, start, end, onPreset, onStart, onEnd, onDemo, onImport, onManual, onExport, onRemoveDemo }: { summary: AnalyticsSummary; events: UsageEvent[]; demo: boolean; preset: RangePreset; start: string; end: string; onPreset: (value: RangePreset) => void; onStart: (value: string) => void; onEnd: (value: string) => void; onDemo: () => void; onImport: () => void; onManual: () => void; onExport: () => void; onRemoveDemo: () => void }) {
  const trend = summary.byDay.map((day) => ({ day: day.key.slice(5), tokens: day.tokens.total, actual: day.actualCost.amount, estimated: day.estimatedCost.amount }));
  const platform = summary.byProvider.map((row) => ({ name: row.key, tokens: row.tokens.total }));
  const models = summary.byModel.slice().sort((a, b) => b.tokens.total - a.tokens.total).slice(0, 5);
  return <div className="animate-in"><PageHeader eyebrow="OVERVIEW" title="Your AI usage, in one view" description="Separate verified spend from estimates and see what is driving your token footprint." actions={<><DateControls preset={preset} start={start} end={end} onPreset={onPreset} onStart={onStart} onEnd={onEnd} /><button className="button button-primary" onClick={onImport}><Upload size={16} /> Import usage</button></>} />
    {!events.length && !summary.events ? <EmptyState onDemo={onDemo} onImport={onImport} onManual={onManual} /> : <>
      <div className="notice-bar"><div><span className="live-dot" /> Local records · range updates instantly <span className="notice-separator">·</span> {summary.range.timeZone}</div><div>{demo && <Tag tone="purple">DEMO DATA</Tag>}<button className="link-button" onClick={onManual}><Plus size={14} /> Add record</button>{demo && <button className="link-button muted-link" onClick={onRemoveDemo}>Remove DEMO</button>}</div></div>
      <div className="kpi-grid six-kpis"><KpiCard label="Total tokens" value={fmtTokens(summary.tokens.total)} foot="input + output; cached subsets not double-counted" icon={Zap} accent="purple" /><KpiCard label="Input tokens" value={fmtTokens(summary.tokens.input)} foot="prompt context" icon={ArrowDownToLine} accent="cyan" /><KpiCard label="Output tokens" value={fmtTokens(summary.tokens.output)} foot="generated completion" icon={ArrowUpRight} accent="green" /><KpiCard label="Requests / events" value={summary.requests.toLocaleString()} foot={`${summary.events.toLocaleString()} normalized events`} icon={Activity} accent="amber" /><KpiCard label="Actual API spend" value={displayCost(summary, "actual")} foot={summary.actualCostEvents ? "provider-reported costs" : "not reported by these sources"} icon={CircleDollarSign} accent="blue" /><KpiCard label="API-equivalent" value={displayCost(summary, "estimated")} foot={summary.unknownCostEvents ? "some records have no price rule" : `pricing catalog ${CATALOG.version}`} icon={TrendingUp} accent="purple" /></div>
      <div className="dashboard-grid"><section className="panel chart-panel"><PanelTitle title="Token consumption" subtitle="Daily volume in the selected range"><Tag tone={demo ? "purple" : "blue"}>{demo ? "DEMO" : "RECORDED"}</Tag></PanelTitle>{trend.length ? <ResponsiveContainer width="100%" height={260}><AreaChart data={trend} margin={{ left: 0, right: 5, top: 10, bottom: 0 }}><defs><linearGradient id="tokenscopeTokenGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.38} /><stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="day" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtTokens} width={42} /><Tooltip content={<ChartTip />} /><Area type="monotone" dataKey="tokens" name="Tokens" stroke="#8b5cf6" fill="url(#tokenscopeTokenGradient)" strokeWidth={2.5} /></AreaChart></ResponsiveContainer> : <ChartEmpty />}</section><section className="panel"><PanelTitle title="Platforms" subtitle="Token volume by provider" />{platform.length ? <ResponsiveContainer width="100%" height={260}><BarChart data={platform} layout="vertical" margin={{ left: 5, right: 10 }}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} /><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={72} tick={{ fill: "var(--text)", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip content={<ChartTip />} /><Bar dataKey="tokens" fill="#22d3ee" radius={[0, 5, 5, 0]} barSize={18} /></BarChart></ResponsiveContainer> : <ChartEmpty />}</section></div>
      <div className="dashboard-grid"><section className="panel"><PanelTitle title="Top models" subtitle="Sorted by normalized token volume" />{models.length ? <div className="ranking-list">{models.map((model, index) => <div className="ranking-row" key={model.key}><span className="rank-number">0{index + 1}</span><span className="ranking-name"><strong>{model.key}</strong><small>{model.events} events · {model.unknownCostEvents ? "pricing unavailable" : fmtMoney(model.estimatedCost.amount)}</small></span><span className="ranking-value">{fmtTokens(model.tokens.total)}</span></div>)}</div> : <ChartEmpty />}</section><section className="panel"><PanelTitle title="Cost signal" subtitle="Actual spend and API-equivalent estimate" /><div className="cost-signal"><div><span className="eyebrow">ACTUAL API</span><strong>{displayCost(summary, "actual")}</strong><small>{summary.actualCostEvents ? `${summary.actualCostEvents} events with reported cost` : "Unknown until a source reports billing"}</small></div><div><span className="eyebrow">ESTIMATED EQUIVALENT</span><strong>{displayCost(summary, "estimated")}</strong><small>What this token mix would cost at catalog rates</small></div></div><div className="info-callout"><Info size={16} /><span>Subscription fees are tracked separately in Cost Intelligence and are never folded into API spend.</span></div></section></div>
      <RecentActivity events={events} onManual={onManual} onExport={onExport} />
    </>}
  </div>;
}

function ChartEmpty() { return <div className="chart-empty"><BarChart3 size={22} /><span>Not enough data to chart yet</span></div>; }

function RecentActivity({ events, onManual, onExport }: { events: UsageEvent[]; onManual: () => void; onExport: () => void }) {
  return <section className="panel activity-panel"><PanelTitle title="Recent activity" subtitle="The latest normalized events in your workspace"><div className="panel-actions"><button className="button button-ghost" onClick={onExport}><Download size={14} /> Export range</button><button className="button button-secondary" onClick={onManual}><Plus size={14} /> Add record</button></div></PanelTitle><ActivityTable events={events.slice(0, 8)} /></section>;
}

function ActivityTable({ events, onDelete }: { events: UsageEvent[]; onDelete?: (id: string) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>EVENT</th><th>PLATFORM / MODEL</th><th>TOKENS</th><th>COST</th><th>ACCURACY</th><th /></tr></thead><tbody>{events.length ? events.map((event) => { const tokens = deriveTotalTokens(event.tokens, event.sourceReportedTotal); const cost = calculateEventCost(event, CATALOG); return <tr key={event.id}><td><div className="event-time"><span className="event-dot" />{new Date(event.occurredAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div><small>{event.project ?? event.source ?? "Uncategorized"}</small></td><td><strong>{event.platform ?? event.provider}</strong><small>{event.model}{event.platform ? ` · ${event.provider}` : ""}</small></td><td><strong>{fmtTokens(tokens.total)}</strong><small>{fmtTokens(tokens.input)} in · {fmtTokens(tokens.output)} out{event.requestCount ? ` · ${event.requestCount} requests` : ""}</small></td><td>{cost.actual ? <><strong>{fmtMoney(cost.actual.amount, cost.actual.currency)}</strong><small><Tag tone="green">ACTUAL</Tag></small></> : cost.estimated ? <><strong>~{fmtMoney(cost.estimated.amount, cost.estimated.currency)}</strong><small><Tag tone="amber">{event.source === "demo" ? "DEMO" : "ESTIMATED"}</Tag></small></> : <><strong>Unknown</strong><small><Tag tone="amber">NO PRICE</Tag></small></>}</td><td><Tag tone={event.source === "demo" ? "purple" : event.dataAccuracy === "verified" ? "green" : "amber"}>{event.source === "demo" ? "DEMO" : event.dataAccuracy ?? "unknown"}</Tag></td><td>{onDelete && <button className="icon-button" onClick={() => onDelete(event.id)} aria-label={`Delete ${event.model}`}><Trash2 size={15} /></button>}</td></tr>; }) : <tr><td colSpan={6}><div className="table-empty">No usage events match this range or filter.</div></td></tr>}</tbody></table></div>;
}

function FilterBar({ options, filters, setFilters }: { options: FilterOptions; filters: FilterState; setFilters: (value: FilterState) => void }) {
  const set = (key: keyof FilterState, value: string) => setFilters({ ...filters, [key]: value });
  return <div className="filter-bar"><div className="filter-label"><span className="filter-pulse" /> Filters</div><select className="select-control" value={filters.platform} onChange={(event) => set("platform", event.target.value)}><option value="all">All platforms</option>{options.platforms.map((item) => <option key={item}>{item}</option>)}</select><select className="select-control" value={filters.provider} onChange={(event) => set("provider", event.target.value)}><option value="all">All providers</option>{options.providers.map((item) => <option key={item}>{item}</option>)}</select><select className="select-control" value={filters.model} onChange={(event) => set("model", event.target.value)}><option value="all">All models</option>{options.models.map((item) => <option key={item}>{item}</option>)}</select><select className="select-control" value={filters.project} onChange={(event) => set("project", event.target.value)}><option value="all">All projects</option>{options.projects.map((item) => <option key={item}>{item}</option>)}</select><select className="select-control" value={filters.accuracy} onChange={(event) => set("accuracy", event.target.value)}><option value="all">All accuracy</option><option value="verified">Verified</option><option value="estimated">Estimated</option><option value="manual">Manual</option><option value="demo">Demo</option><option value="unknown">Unknown</option></select><select className="select-control" value={filters.costClassification} onChange={(event) => set("costClassification", event.target.value)}><option value="all">All cost types</option><option value="actual_api">Actual API</option><option value="estimated_api_equivalent">API-equivalent</option><option value="subscription">Subscription</option><option value="unknown">Unknown cost</option></select><select className="select-control" value={filters.source} onChange={(event) => set("source", event.target.value)}><option value="all">All sources</option>{options.sources.map((item) => <option key={item}>{item}</option>)}</select></div>;
}

function UsageView({ summary, events, options, filters, setFilters }: { summary: AnalyticsSummary; events: UsageEvent[]; options: FilterOptions; filters: FilterState; setFilters: (value: FilterState) => void }) {
  const [metric, setMetric] = useState<"tokens" | "requests" | "cost">("tokens");
  const trend = summary.byDay.map((day) => ({ day: day.key.slice(5), tokens: day.tokens.total, requests: day.requests, cost: day.estimatedCost.amount }));
  const ranking = summary.byModel.slice().sort((a, b) => (metric === "requests" ? b.requests - a.requests : metric === "cost" ? b.estimatedCost.amount - a.estimatedCost.amount : b.tokens.total - a.tokens.total));
  return <div className="animate-in"><PageHeader eyebrow="USAGE ANALYTICS" title="Usage analytics" description="Filter normalized usage by source, project, model, and accuracy before exporting exact records." /><FilterBar options={options} filters={filters} setFilters={setFilters} /><div className="kpi-grid"><KpiCard label="Input tokens" value={fmtTokens(summary.tokens.input)} foot="prompt context" icon={ArrowDownToLine} accent="purple" /><KpiCard label="Output tokens" value={fmtTokens(summary.tokens.output)} foot="generated completion" icon={ArrowUpRight} accent="cyan" /><KpiCard label="Average / request" value={fmtTokens(summary.requests ? summary.tokens.total / summary.requests : 0)} foot="token volume per request" icon={Activity} accent="green" /><KpiCard label="Cached input" value={summary.tokens.cachedInput ? fmtTokens(summary.tokens.cachedInput) : "Unknown"} foot={summary.tokens.cachedInput ? "reported subset of input" : "not reported"} icon={Zap} accent="amber" /></div><section className="panel large-chart"><div className="panel-title"><div><h3>Daily consumption</h3><p>Switch between volume, request cadence, and API-equivalent cost.</p></div><div className="metric-switch">{(["tokens", "requests", "cost"] as const).map((item) => <button key={item} className={metric === item ? "selected" : ""} onClick={() => setMetric(item)}>{item === "tokens" ? "Tokens" : item === "requests" ? "Requests" : "Cost"}</button>)}</div></div><ResponsiveContainer width="100%" height={350}><LineChart data={trend}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="day" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} tickFormatter={(value) => metric === "cost" ? `$${value}` : metric === "tokens" ? fmtTokens(value) : String(value)} axisLine={false} tickLine={false} /><Tooltip content={<ChartTip />} /><Line type="monotone" dataKey={metric} name={metric} stroke={metric === "cost" ? "#f59e0b" : metric === "requests" ? "#22d3ee" : "#8b5cf6"} strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></section><div className="dashboard-grid"><section className="panel"><PanelTitle title="Model ranking" subtitle={`Sorted by ${metric}`} />{ranking.length ? <div className="ranking-list">{ranking.map((row, index) => <div className="ranking-row" key={row.key}><span className="rank-number">{String(index + 1).padStart(2, "0")}</span><span className="ranking-name"><strong>{row.key}</strong><small>{row.events} events · {row.requests} requests</small></span><span className="ranking-value">{metric === "cost" ? displayAggregateCost(row) : metric === "requests" ? row.requests.toLocaleString() : fmtTokens(row.tokens.total)}</span></div>)}</div> : <ChartEmpty />}</section><section className="panel"><PanelTitle title="Exact records" subtitle={`${events.length.toLocaleString()} events in the selected range`} /><ActivityTable events={events.slice(0, 10)} /></section></div></div>;
}

function displayAggregateCost(row: { estimatedCost: { amount: number; currency: string }; unknownCostEvents: number; events: number; mixedCurrencies?: boolean }) {
  if (row.mixedCurrencies) return "Mixed currencies";
  if (row.unknownCostEvents >= row.events) return "Unknown";
  return `${row.unknownCostEvents ? "~" : ""}${fmtMoney(row.estimatedCost.amount, row.estimatedCost.currency)}`;
}

function PlatformsView({ summary, events, onImport }: { summary: AnalyticsSummary; events: UsageEvent[]; onImport: () => void }) {
  const platformRows = summary.byProvider;
  return <div className="animate-in"><PageHeader eyebrow="PLATFORMS & MODELS" title="Your AI stack" description="Compare the sources represented in imported records. A card is never shown as connected without a successful import." actions={<button className="button button-primary" onClick={onImport}><Upload size={15} /> Import source</button>} /><div className="platform-grid">{platformRows.map((row, index) => <div className="platform-card" key={row.key}><div className="platform-logo" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}>{row.key.slice(0, 1)}</div><div><strong>{row.key}</strong><small>{row.events} events · {row.requests} requests</small></div><div className="platform-value"><strong>{fmtTokens(row.tokens.total)}</strong><small>tokens</small></div></div>)}{!platformRows.length && <div className="panel platform-empty"><Database size={22} /><strong>No sources yet</strong><span>Import an export to discover platforms honestly.</span></div>}</div><section className="panel"><PanelTitle title="Model coverage" subtitle="Volume, cost confidence, and source health" /><div className="table-wrap"><table><thead><tr><th>MODEL</th><th>PROVIDER</th><th>EVENTS</th><th>TOKENS</th><th>EST. COST</th><th>STATUS</th></tr></thead><tbody>{summary.byModel.map((row) => { const sourceEvent = events.find((event) => event.model === row.key); return <tr key={row.key}><td><strong>{row.key}</strong><small>{sourceEvent?.modelVersion ? `v${sourceEvent.modelVersion}` : "Version not supplied"}</small></td><td>{sourceEvent?.provider ?? "—"}</td><td>{row.events.toLocaleString()}</td><td>{fmtTokens(row.tokens.total)}</td><td>{displayAggregateCost(row)}</td><td><Tag tone={row.unknownCostEvents ? "amber" : "green"}>{row.unknownCostEvents ? "PARTIAL PRICING" : "CATALOG MATCH"}</Tag></td></tr>; })}{!summary.byModel.length && <tr><td colSpan={6}><div className="table-empty">Import usage data to compare models.</div></td></tr>}</tbody></table></div></section></div>;
}

function CostView({ summary, subscriptionFee, budget, onSubscription, onBudget }: { summary: AnalyticsSummary; subscriptionFee: number; budget: number; onSubscription: (value: number) => void; onBudget: (value: number) => void }) {
  const estimated = summary.estimatedCost.amount;
  const monthlyEquivalent = estimated + subscriptionFee;
  const budgetUsed = budget > 0 ? Math.min(100, (monthlyEquivalent / budget) * 100) : 0;
  const rows = summary.byProvider.map((row) => ({ name: row.key, actual: row.actualCost.amount, estimated: row.estimatedCost.amount }));
  return <div className="animate-in"><PageHeader eyebrow="COST INTELLIGENCE" title="Know what usage costs" description="Actual API spend, API-equivalent estimates, and subscription fees stay separate by design." actions={<Tag tone="amber">COSTS ARE LABELED</Tag>} /><div className="kpi-grid"><KpiCard label="Actual API spend" value={displayCost(summary, "actual")} foot="provider-reported only" icon={CircleDollarSign} accent="green" /><KpiCard label="API-equivalent" value={displayCost(summary, "estimated")} foot={`catalog ${CATALOG.version}`} icon={TrendingUp} accent="purple" /><KpiCard label="Subscription fee" value={fmtMoney(subscriptionFee)} foot="flat fee you enter" icon={Users} accent="cyan" /><KpiCard label="Budget headroom" value={budget ? fmtMoney(Math.max(0, budget - monthlyEquivalent)) : "Set a budget"} foot={budget ? `${Math.round(budgetUsed)}% of monthly budget` : "not calculated"} icon={Zap} accent="amber" /></div><div className="cost-layout"><section className="panel"><PanelTitle title="Reporting assumptions" subtitle="Saved locally on this device" /><div className="form-grid compact-grid"><label>Monthly subscription fee<input type="number" min="0" step="0.01" value={subscriptionFee} onChange={(event) => onSubscription(Math.max(0, safeNumber(event.target.value)))} /></label><label>Monthly budget<input type="number" min="0" step="0.01" value={budget} onChange={(event) => onBudget(Math.max(0, safeNumber(event.target.value)))} /></label></div><div className="budget-meter"><div className="budget-meter-label"><span>Subscription + API-equivalent</span><strong>{budget ? `${fmtMoney(monthlyEquivalent)} / ${fmtMoney(budget)}` : "Budget not set"}</strong></div><div className="budget-track"><span style={{ width: `${budgetUsed}%` }} /></div><small>{summary.unknownCostEvents ? `${summary.unknownCostEvents} event(s) have no matching pricing rule; estimate may be incomplete.` : "All selected models match the current catalog."}</small></div></section><section className="panel cost-definition"><PanelTitle title="Cost definitions" subtitle="Never mix incomparable measurements" /><div className="confidence-row"><Tag tone="green">ACTUAL</Tag><span>Cost supplied by a provider billing or usage report. Unknown when the source does not report it.</span></div><div className="confidence-row"><Tag tone="amber">ESTIMATED</Tag><span>Token volume priced against a versioned local catalog. A tilde marks a partial estimate.</span></div><div className="confidence-row"><Tag tone="blue">SUBSCRIPTION</Tag><span>Flat fee you actually pay. It is not the API-equivalent cost of consumer activity.</span></div></section></div><section className="panel"><PanelTitle title="Spend by provider" subtitle="USD values from selected records" />{rows.length ? <ResponsiveContainer width="100%" height={280}><BarChart data={rows}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} /><Tooltip content={<ChartTip />} /><Bar dataKey="estimated" name="Estimated" fill="#8b5cf6" radius={[5, 5, 0, 0]} /><Bar dataKey="actual" name="Actual" fill="#45d39a" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer> : <ChartEmpty />}</section><div className="info-callout wide-callout"><Info size={16} /><span>Pricing rules are bundled examples for the MVP and should be reviewed before using them for a financial decision. Edit or add pricing rules in a future catalog editor; no provider price is silently treated as current.</span></div></div>;
}

const DEFAULT_SCENARIO: ScenarioInput = { name: "New launch", monthlyActiveUsers: 1_000, requestsPerUserPerDay: 2, inputTokensPerRequest: 1_200, outputTokensPerRequest: 500, cachedInputPercent: 20, activeDaysPerMonth: 30, inputPerMillion: 0.15, outputPerMillion: 0.6, cacheInputPerMillion: 0.05, fixedMonthlyFees: 0, growthRate: 10, budgetLimit: 500, currency: "USD" };

function PlannerView({ summary }: { summary: AnalyticsSummary }) {
  const [scenario, setScenario] = useState<ScenarioInput>(DEFAULT_SCENARIO);
  const [saved, setSaved] = useState<ScenarioInput[]>([]);
  const [method, setMethod] = useState<"moving-average" | "linear-trend">("moving-average");
  const [forecastDays, setForecastDays] = useState(30);
  useEffect(() => { try { const stored = JSON.parse(window.localStorage.getItem("tokenscope:scenarios") ?? "[]"); if (Array.isArray(stored)) setSaved(stored); } catch { /* corrupted scenario storage is safely ignored */ } }, []);
  const result: ScenarioEstimate | null = useMemo(() => { try { return calculateScenario(scenario); } catch { return null; } }, [scenario]);
  const forecast: ForecastResult = useMemo(() => forecastUsage(summary.byDay, forecastDays, { method, currency: "USD" }), [forecastDays, method, summary.byDay]);
  const field = (key: keyof ScenarioInput) => (event: React.ChangeEvent<HTMLInputElement>) => setScenario((current) => ({ ...current, [key]: key === "name" ? event.target.value : safeNumber(event.target.value) }));
  const save = () => { const next = [...saved.filter((item) => item.name !== scenario.name), scenario]; setSaved(next); window.localStorage.setItem("tokenscope:scenarios", JSON.stringify(next)); };
  const duplicate = () => setScenario({ ...scenario, name: `${scenario.name} copy` });
  return <div className="animate-in"><PageHeader eyebrow="STARTUP PLANNER" title="Plan before you scale" description="A transparent scenario model for hypothetical demand. It never rewrites historical usage or actual bills." actions={<><button className="button button-secondary" onClick={duplicate}>Duplicate</button><button className="button button-primary" onClick={save}><Check size={15} /> Save scenario</button></>} /><div className="planner-layout"><section className="panel planner-inputs"><PanelTitle title="Scenario assumptions" subtitle="Every value is explicit and editable" /><div className="form-grid"><label>Scenario name<input value={scenario.name} onChange={field("name")} /></label><label>Monthly active users<input type="number" min="0" value={scenario.monthlyActiveUsers} onChange={field("monthlyActiveUsers")} /></label><label>Requests per user / day<input type="number" min="0" step="any" value={scenario.requestsPerUserPerDay} onChange={field("requestsPerUserPerDay")} /></label><label>Input tokens / request<input type="number" min="0" value={scenario.inputTokensPerRequest} onChange={field("inputTokensPerRequest")} /></label><label>Output tokens / request<input type="number" min="0" value={scenario.outputTokensPerRequest} onChange={field("outputTokensPerRequest")} /></label><label>Cached input %<input type="number" min="0" max="100" value={scenario.cachedInputPercent} onChange={field("cachedInputPercent")} /></label><label>Active days / month<input type="number" min="1" max="31" value={scenario.activeDaysPerMonth} onChange={field("activeDaysPerMonth")} /></label><label>Growth rate %<input type="number" min="0" value={scenario.growthRate} onChange={field("growthRate")} /></label><label>Input price / 1M<input type="number" min="0" step="any" value={scenario.inputPerMillion} onChange={field("inputPerMillion")} /></label><label>Output price / 1M<input type="number" min="0" step="any" value={scenario.outputPerMillion} onChange={field("outputPerMillion")} /></label><label>Cache price / 1M<input type="number" min="0" step="any" value={scenario.cacheInputPerMillion} onChange={field("cacheInputPerMillion")} /></label><label>Fixed monthly fees<input type="number" min="0" step="any" value={scenario.fixedMonthlyFees} onChange={field("fixedMonthlyFees")} /></label><label>Budget limit<input type="number" min="0" step="any" value={scenario.budgetLimit} onChange={field("budgetLimit")} /></label></div><p className="form-hint">Prices are per million tokens in {scenario.currency}. Change them to match a dated provider quote; TokenScope does not fetch prices silently.</p>{saved.length > 0 && <div className="saved-scenarios"><span className="eyebrow">SAVED SCENARIOS</span>{saved.map((item) => <button key={item.name} className="saved-scenario" onClick={() => setScenario(item)}><span>{item.name}</span><small>{item.monthlyActiveUsers.toLocaleString()} users</small></button>)}</div>}</section><section className="planner-results">{result ? <><div className="planner-hero panel"><div><span className="eyebrow">EXPECTED MONTHLY COST</span><h2>{fmtMoney(result.totalCostPerMonth, result.currency)}</h2><p><Tag tone="amber">HYPOTHETICAL ESTIMATE</Tag> · {fmtTokens(result.totalTokensPerMonth)} tokens/month</p></div><div className="planner-control"><span>Headroom</span><strong>{result.budgetHeadroom === undefined ? "—" : fmtMoney(result.budgetHeadroom, result.currency)}</strong></div></div><div className="planner-stats"><div className="panel"><small>Daily tokens</small><strong>{fmtTokens(result.dailyTokens)}</strong></div><div className="panel"><small>API cost</small><strong>{fmtMoney(result.apiCostPerMonth, result.currency)}</strong></div><div className="panel"><small>Cost / active user</small><strong>{fmtMoney(result.costPerActiveUser, result.currency)}</strong></div></div><section className="panel"><PanelTitle title="Low / expected / high" subtitle="Same assumptions, different active-user volume" /><div className="scenario-cards">{([result.low, result.expected, result.high] as const).map((item, index) => <div key={item.users} className={`scenario-card ${index === 1 ? "selected" : ""}`}><span>{index === 0 ? "LOW" : index === 1 ? "EXPECTED" : "HIGH"}</span><strong>{item.users.toLocaleString()}</strong><small>users · {fmtMoney(item.totalCost, result.currency)}</small></div>)}</div></section><section className="panel"><PanelTitle title="Growth milestones" subtitle="Fixed pricing assumptions; excludes product margins" /><div className="milestone-list">{result.milestones.slice(0, 6).map((item) => <div key={`${item.users}-${item.totalCost}`}><span>{item.users.toLocaleString()} users</span><strong>{fmtMoney(item.totalCost, result.currency)}</strong></div>)}</div></section></> : <div className="panel invalid-state"><AlertCircle size={20} /><strong>Check the scenario inputs</strong><span>All numeric assumptions must be finite and active days must be greater than zero.</span></div>}</section></div><section className="panel forecast-section"><div className="panel-title"><div><h3>Actual vs forecast</h3><p>Historical imported data stays separate from this scenario projection.</p></div><div className="metric-switch"><select className="select-control" value={method} onChange={(event) => setMethod(event.target.value as "moving-average" | "linear-trend")}><option value="moving-average">Moving average</option><option value="linear-trend">Linear trend</option></select><select className="select-control" value={forecastDays} onChange={(event) => setForecastDays(Number(event.target.value))}><option value={14}>14 days</option><option value={30}>30 days</option><option value={60}>60 days</option></select></div></div>{summary.byDay.length ? <ResponsiveContainer width="100%" height={280}><AreaChart data={forecast.periods}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="period" tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} tickFormatter={fmtTokens} axisLine={false} tickLine={false} /><Tooltip content={<ChartTip />} /><Area dataKey="predictedTokens" name="Forecast tokens" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.1} /></AreaChart></ResponsiveContainer> : <ChartEmpty />}</section></div>;
}

function SourcesView({ onImport, onManual, onDemo }: { onImport: () => void; onManual: () => void; onDemo: () => void }) {
  return <div className="animate-in"><PageHeader eyebrow="DATA SOURCES" title="Bring your data together" description="Use official exports and local records without handing TokenScope a provider password." /><div className="source-grid"><div className="source-card source-primary"><div className="source-card-icon"><Upload size={20} /></div><h3>Import an export</h3><p>CSV, JSON, and JSONL are parsed locally with preview, mapping, duplicate detection, and rejected-row reporting.</p><button className="button button-primary" onClick={onImport}>Open import wizard <ArrowUpRight size={15} /></button></div><div className="source-card"><div className="source-card-icon cyan"><Plus size={20} /></div><h3>Manual record</h3><p>Capture an estimate or a one-off event when a platform does not expose a usable export.</p><button className="button button-secondary" onClick={onManual}>Add usage event <Plus size={15} /></button></div><div className="source-card disabled-source"><div className="source-card-icon green"><Github size={20} /></div><div className="source-title-line"><h3>Direct integrations</h3><Tag>PLANNED</Tag></div><p>OpenAI org reports, Anthropic Console reports, LiteLLM, Claude Code, Codex CLI, and Gemini CLI adapters are designed for Phase 2.</p><span className="muted">Not connected · no credentials requested</span></div></div><div className="sample-banner"><div><Sparkles size={19} /><div><strong>Explore without real data</strong><span>DEMO records are clearly labelled and removable from Settings.</span></div></div><button className="button button-ghost" onClick={onDemo}>Load DEMO workspace</button></div><section className="panel source-contract"><PanelTitle title="Source contract" subtitle="What TokenScope will and will not ingest" /><div className="contract-grid"><div><Check size={16} /><span>Token counts, timestamps, models, projects, and costs when supplied.</span></div><div><Check size={16} /><span>Stable source IDs when present; repeated imports are idempotent.</span></div><div><X size={16} /><span>Raw prompts, responses, passwords, cookies, or complete transcripts.</span></div><div><X size={16} /><span>Consumer subscription activity inferred from an API key.</span></div></div></section></div>;
}

function HistoryView({ events, inRangeEvents, query, setQuery, onExport, onClear, onDelete }: { events: UsageEvent[]; inRangeEvents: UsageEvent[]; query: string; setQuery: (value: string) => void; onExport: (format: "csv" | "json" | "jsonl") => void; onClear: () => void; onDelete: (id: string) => void }) {
  const sources = [...new Set(events.map((event) => event.source ?? "manual"))];
  const visible = events.filter((event) => `${event.provider} ${event.model} ${event.platform ?? ""} ${event.source ?? ""}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return <div className="animate-in"><PageHeader eyebrow="IMPORT HISTORY" title="Your local activity log" description="Records remain on this device until you export or delete them." actions={<button className="button button-ghost danger" onClick={onClear}><Trash2 size={15} /> Clear all</button>} /><div className="history-toolbar"><div className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search provider, model, platform" aria-label="Search activity" /></div><div className="export-group"><button className="button button-ghost" onClick={() => onExport("json")}><FileJson size={14} /> JSON</button><button className="button button-ghost" onClick={() => onExport("csv")}><FileText size={14} /> CSV</button><button className="button button-ghost" onClick={() => onExport("jsonl")}>JSONL</button></div></div><section className="panel"><div className="history-meta"><span><strong>{events.length}</strong> events stored</span><span><strong>{sources.length}</strong> sources</span><span><strong>{inRangeEvents.length}</strong> in selected range</span><span className="muted">IndexedDB with localStorage fallback</span></div><ActivityTable events={visible.slice(0, 100)} onDelete={onDelete} /></section></div>;
}

function SettingsView({ theme, setTheme, demo, onRemoveDemo, onClear, onExport }: { theme: Theme; setTheme: (value: Theme) => void; demo: boolean; onRemoveDemo: () => void; onClear: () => void; onExport: () => void }) {
  return <div className="animate-in"><PageHeader eyebrow="SETTINGS" title="Workspace settings" description="Keep the MVP local, inspect its boundaries, and manage your data lifecycle." /><div className="settings-layout"><section className="panel settings-panel"><h3>Appearance</h3><p className="settings-description">Theme preference is saved in this browser.</p><div className="setting-row"><div><strong>Theme</strong><small>Switch without changing analytics.</small></div><div className="theme-switch"><button className={theme === "light" ? "selected" : ""} onClick={() => setTheme("light")}><Sun size={15} /> Light</button><button className={theme === "dark" ? "selected" : ""} onClick={() => setTheme("dark")}><Moon size={15} /> Dark</button></div></div></section><section className="panel settings-panel"><h3>Data & privacy</h3><p className="settings-description">Core Phase 1 data is stored in IndexedDB when available and falls back to localStorage. There is no cloud sync in this build.</p><div className="setting-row"><div><strong>DEMO records</strong><small>{demo ? "Sample records are active and labelled DEMO." : "No sample records are active."}</small></div>{demo ? <button className="button button-ghost danger" onClick={onRemoveDemo}>Remove DEMO</button> : <Tag>INACTIVE</Tag>}</div><div className="setting-row"><div><strong>Export workspace</strong><small>Download JSON for backup or migration.</small></div><button className="button button-secondary" onClick={onExport}><Download size={14} /> Export JSON</button></div><div className="setting-row danger-row"><div><strong>Delete all data</strong><small>Destructive and irreversible in this browser.</small></div><button className="button button-ghost danger" onClick={onClear}><Trash2 size={14} /> Clear data</button></div></section><section className="panel settings-panel"><h3>Phase 1 boundary</h3><p className="settings-description">TokenScope does not claim universal tracking. Direct provider APIs and local coding-agent connectors are intentionally marked planned until their documented formats and permissions are implemented.</p><div className="status-line"><span className="live-dot" /> Local analytics ready · pricing catalog {CATALOG.version}</div><div className="status-line"><span className="grey-dot" /> Cloud sync, auth, RLS, and provider credentials are not configured</div></section></div></div>;
}

function Modal({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div>{children}</div></div>;
}

const IMPORT_FIELDS = ["occurredAt", "platform", "provider", "model", "input", "output", "cachedInput", "sourceReportedTotal", "requestCount", "actualCost", "currency", "project", "requestId"] as const;

function fileColumns(text: string, format: "csv" | "json" | "jsonl"): string[] {
  try {
    if (format === "csv") return (text.split(/\r?\n/)[0] ?? "").split(",").map((value) => value.trim().replace(/^"|"$/g, "")).filter(Boolean);
    if (format === "json") { const parsed = JSON.parse(text); const first = Array.isArray(parsed) ? parsed[0] : parsed; return first && typeof first === "object" ? Object.keys(first) : []; }
    const first = JSON.parse(text.split(/\r?\n/).find((line) => line.trim()) ?? "{}"); return first && typeof first === "object" ? Object.keys(first) : [];
  } catch { return []; }
}

function downloadText(name: string, content: string, type = "text/plain") {
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type })); link.download = name; link.click(); URL.revokeObjectURL(link.href);
}

function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: (events: UsageEvent[], message: string) => Promise<void> }) {
  const [format, setFormat] = useState<"csv" | "json" | "jsonl">("csv");
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [defaultProvider, setDefaultProvider] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [fieldMap, setFieldMap] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const columns = useMemo(() => fileColumns(text, format), [format, text]);
  const readFile = (file: File) => { setFileName(file.name); setFormat(file.name.toLowerCase().endsWith(".jsonl") ? "jsonl" : file.name.toLowerCase().endsWith(".json") ? "json" : "csv"); const reader = new FileReader(); reader.onload = () => { setText(String(reader.result ?? "")); setResult(null); setError(""); }; reader.onerror = () => setError("The file could not be read."); reader.readAsText(file); };
  const parse = () => { if (!text.trim()) { setError("Choose a file or paste export content first."); return; } const parsed = parseUsageData(text, format, { source: `import:${fileName || format}`, defaultProvider: defaultProvider || undefined, defaultModel: defaultModel || undefined, fieldMap: Object.fromEntries(Object.entries(fieldMap).filter(([, value]) => value)) }); setResult(parsed); setError(""); };
  const template = "occurredAt,platform,provider,model,input,output,cachedInput,actualCost,currency,project\n2026-01-15T12:00:00Z,API workspace,OpenAI,gpt-4o-mini,1200,500,0,0.0005,USD,Example project\n";
  return <Modal title="Import usage data" subtitle="Everything is parsed locally. Review accepted, duplicate, and rejected rows before anything is saved." onClose={onClose}><div className="stepper"><span className={!result ? "active" : ""}>1 <b>Map & validate</b></span><i /><span className={result ? "active" : ""}>2 <b>Review</b></span></div>{!result ? <><div className="drop-zone" onClick={() => fileRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) readFile(file); }}><div className="drop-icon"><Upload size={21} /></div><strong>{fileName || "Drop an export here"}</strong><span>{fileName ? "Click to choose another file" : "or click to browse from your computer"}</span><small>CSV · JSON · JSONL · raw prompts are never needed</small><input ref={fileRef} type="file" hidden accept=".csv,.json,.jsonl,application/json,text/csv" onChange={(event) => event.target.files?.[0] && readFile(event.target.files[0])} /></div><div className="import-actions"><button type="button" className="button button-ghost" onClick={() => downloadText("tokenscope-template.csv", template, "text/csv")}><Download size={14} /> Download template</button><button type="button" className="button button-ghost" onClick={() => setText(template)}>Use template preview</button></div><div className="format-row"><label>Format<select className="select-control" value={format} onChange={(event) => { setFormat(event.target.value as "csv" | "json" | "jsonl"); setResult(null); }}>{["csv", "json", "jsonl"].map((item) => <option key={item}>{item}</option>)}</select></label><label>Default provider <span className="muted">(if absent)</span><input value={defaultProvider} onChange={(event) => setDefaultProvider(event.target.value)} placeholder="OpenAI" /></label><label>Default model <span className="muted">(if absent)</span><input value={defaultModel} onChange={(event) => setDefaultModel(event.target.value)} placeholder="gpt-4o-mini" /></label></div>{columns.length > 0 && <div className="mapping-box"><div className="mapping-heading"><strong>Column mapping</strong><span>Optional — aliases are detected automatically.</span></div>{columns.map((column) => <label key={column}><span>{column}</span><select value={fieldMap[column] ?? ""} onChange={(event) => setFieldMap((current) => ({ ...current, [column]: event.target.value }))}><option value="">Auto-detect</option>{IMPORT_FIELDS.map((field) => <option key={field} value={field}>{field}</option>)}</select></label>)}</div>}{text && <textarea className="import-textarea" value={text} onChange={(event) => { setText(event.target.value); setResult(null); }} placeholder="Or paste CSV / JSON / JSONL content" rows={5} />}{error && <div className="form-error"><AlertCircle size={15} />{error}</div>}<div className="modal-actions"><button className="button button-primary" onClick={parse}><Check size={15} /> Validate import</button><button className="button button-ghost" onClick={onClose}>Cancel</button></div></> : <><div className="import-summary"><div><strong>{result.events.length}</strong><span>accepted</span></div><div><strong>{result.duplicates.length}</strong><span>duplicates</span></div><div><strong>{result.errors.length}</strong><span>rejected</span></div></div>{result.errors.length > 0 && <div className="import-errors"><strong>Rows that need attention</strong>{result.errors.slice(0, 6).map((item) => <div key={`${item.row}-${item.issues[0]?.path}`}><span>Row {item.row}</span><span>{item.issues.map((issue) => `${issue.path || "record"}: ${issue.message}`).join(" · ")}</span></div>)}{result.errors.length > 6 && <small>+ {result.errors.length - 6} more errors · download a corrected source and retry</small>}</div>}{result.duplicates.length > 0 && <div className="info-callout"><Info size={16} /><span>{result.duplicates.length} repeated row(s) were held out using stable event identity. Re-importing the same source is safe.</span></div>}<div className="preview-table"><table><thead><tr><th>TIME</th><th>PROVIDER / MODEL</th><th>TOKENS</th><th>COST</th></tr></thead><tbody>{result.events.slice(0, 5).map((event) => <tr key={event.id}><td>{new Date(event.occurredAt).toLocaleString()}</td><td>{event.provider} · {event.model}</td><td>{fmtTokens(deriveTotalTokens(event.tokens, event.sourceReportedTotal).total)}</td><td>{event.actualCost ? fmtMoney(event.actualCost.amount, event.actualCost.currency) : "Unknown"}</td></tr>)}</tbody></table></div><div className="modal-actions"><button className="button button-primary" disabled={!result.events.length} onClick={() => void onImported(result.events, `Imported ${result.events.length} record(s); ${result.duplicates.length} duplicate(s) skipped.`)}><Upload size={15} /> Import {result.events.length} records</button><button className="button button-secondary" onClick={() => setResult(null)}>Back to mapping</button><button className="button button-ghost" onClick={onClose}>Cancel</button></div></>}</Modal>;
}

function ManualModal({ onClose, onSaved }: { onClose: () => void; onSaved: (event: UsageEvent) => Promise<void> }) {
  const [form, setForm] = useState({ platform: "", provider: "OpenAI", model: "gpt-4o-mini", project: "", occurredAt: new Date().toISOString().slice(0, 16), input: "", output: "", cachedInput: "", requests: "1", cost: "", notes: "" });
  const [error, setError] = useState("");
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const save = async (event: React.FormEvent) => { event.preventDefault(); const input = safeNumber(form.input, Number.NaN); const output = safeNumber(form.output, Number.NaN); if (!form.provider.trim() || !form.model.trim() || !form.occurredAt || !Number.isFinite(input) || input < 0 || !Number.isFinite(output) || output < 0) { setError("Provider, model, date, input tokens, and output tokens are required."); return; } const actual = form.cost.trim() ? safeNumber(form.cost, Number.NaN) : undefined; if (actual !== undefined && (!Number.isFinite(actual) || actual < 0)) { setError("Actual cost must be a non-negative number or left blank when unknown."); return; } try { await onSaved(createUsageEvent({ id: `manual-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`, occurredAt: form.occurredAt, platform: form.platform.trim() || undefined, provider: form.provider.trim(), model: form.model.trim(), project: form.project.trim() || undefined, tokens: { input, output, cachedInput: form.cachedInput ? safeNumber(form.cachedInput) : undefined }, requestCount: form.requests ? Math.max(1, Math.round(safeNumber(form.requests, 1))) : 1, actualCost: actual === undefined ? undefined : { amount: actual, currency: "USD", kind: "actual" }, costClassification: actual === undefined ? "unknown" : "actual_api", dataAccuracy: "manual", source: "manual", metadata: form.notes.trim() ? { notes: form.notes.trim() } : undefined })); } catch (caught) { setError(caught instanceof Error ? caught.message : "The record could not be created."); } };
  return <Modal title="Add a manual record" subtitle="Manual entries are labelled and kept separate from verified provider reports." onClose={onClose}><form onSubmit={save} className="manual-form"><div className="form-grid"><label>Platform <span className="muted">(optional)</span><input value={form.platform} onChange={set("platform")} placeholder="Claude Code" /></label><label>Provider<input value={form.provider} onChange={set("provider")} placeholder="OpenAI" /></label><label>Model<input value={form.model} onChange={set("model")} placeholder="gpt-4o-mini" /></label><label>Project / tag <span className="muted">(optional)</span><input value={form.project} onChange={set("project")} placeholder="Launch" /></label><label>Date & time<input type="datetime-local" value={form.occurredAt} onChange={set("occurredAt")} /></label><label>Requests<input type="number" min="1" value={form.requests} onChange={set("requests")} /></label><label>Input tokens<input type="number" min="0" value={form.input} onChange={set("input")} placeholder="1200" /></label><label>Output tokens<input type="number" min="0" value={form.output} onChange={set("output")} placeholder="500" /></label><label>Cached input <span className="muted">(optional)</span><input type="number" min="0" value={form.cachedInput} onChange={set("cachedInput")} placeholder="Unknown" /></label><label>Actual API cost <span className="muted">(optional)</span><input type="number" min="0" step="any" value={form.cost} onChange={set("cost")} placeholder="Unknown" /></label></div><label>Notes <span className="muted">(metadata only; no prompt content)</span><textarea value={form.notes} onChange={set("notes")} rows={3} placeholder="Why this was entered manually" /></label>{error && <div className="form-error"><AlertCircle size={15} />{error}</div>}<div className="modal-actions"><button className="button button-primary" type="submit"><Check size={15} /> Save manual record</button><button className="button button-ghost" type="button" onClick={onClose}>Cancel</button></div></form></Modal>;
}
