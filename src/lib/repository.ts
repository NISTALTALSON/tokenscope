import { UsageEvent, UsageEventRepository } from "./types";

const sortEvents = (events: UsageEvent[]) => events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));

/** In-memory implementation useful for tests, previews, and SSR. */
export class MemoryUsageEventRepository implements UsageEventRepository {
  private readonly events = new Map<string, UsageEvent>();
  async put(event: UsageEvent): Promise<void> { this.events.set(event.id, event); }
  async putMany(events: readonly UsageEvent[]): Promise<void> { events.forEach((event) => this.events.set(event.id, event)); }
  async get(id: string): Promise<UsageEvent | undefined> { return this.events.get(id); }
  async getAll(): Promise<UsageEvent[]> { return sortEvents([...this.events.values()]); }
  async delete(id: string): Promise<void> { this.events.delete(id); }
  async clear(): Promise<void> { this.events.clear(); }
  async query(range: { start?: string; end?: string } = {}): Promise<UsageEvent[]> { return (await this.getAll()).filter((e) => (!range.start || e.occurredAt >= range.start) && (!range.end || e.occurredAt < range.end)); }
}

export class LocalStorageUsageEventRepository implements UsageEventRepository {
  constructor(private readonly storageKey = "tokenscope:usage-events", private readonly storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage) {}
  private read(): UsageEvent[] { if (!this.storage) return []; try { const value = JSON.parse(this.storage.getItem(this.storageKey) ?? "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
  private write(events: UsageEvent[]): void { if (!this.storage) throw new Error("localStorage is unavailable in this environment"); this.storage.setItem(this.storageKey, JSON.stringify(events)); }
  async put(event: UsageEvent): Promise<void> { const events = this.read().filter((e) => e.id !== event.id); events.push(event); this.write(events); }
  async putMany(events: readonly UsageEvent[]): Promise<void> { const map = new Map<string, UsageEvent>(); this.read().forEach((event) => map.set(event.id, event)); events.forEach((event) => map.set(event.id, event)); this.write([...map.values()]); }
  async get(id: string): Promise<UsageEvent | undefined> { return this.read().find((e) => e.id === id); }
  async getAll(): Promise<UsageEvent[]> { return sortEvents(this.read()); }
  async delete(id: string): Promise<void> { this.write(this.read().filter((e) => e.id !== id)); }
  async clear(): Promise<void> { this.write([]); }
  async query(range: { start?: string; end?: string } = {}): Promise<UsageEvent[]> { return (await this.getAll()).filter((e) => (!range.start || e.occurredAt >= range.start) && (!range.end || e.occurredAt < range.end)); }
}

/** IndexedDB repository with one object store; safe to construct only in a browser. */
export class IndexedDbUsageEventRepository implements UsageEventRepository {
  private dbPromise?: Promise<IDBDatabase>;
  constructor(private readonly databaseName = "tokenscope", private readonly storeName = "usage-events", private readonly indexedDBFactory: IDBFactory | undefined = typeof indexedDB === "undefined" ? undefined : indexedDB) {}
  private db(): Promise<IDBDatabase> { if (!this.indexedDBFactory) return Promise.reject(new Error("IndexedDB is unavailable in this environment")); this.dbPromise ??= new Promise((resolve, reject) => { const request = this.indexedDBFactory!.open(this.databaseName, 1); request.onerror = () => reject(request.error); request.onupgradeneeded = () => request.result.createObjectStore(this.storeName, { keyPath: "id" }); request.onsuccess = () => resolve(request.result); }); return this.dbPromise; }
  private operation<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void): Promise<T> { return this.db().then((db) => new Promise<T>((resolve, reject) => { const tx = db.transaction(this.storeName, mode); work(tx.objectStore(this.storeName), resolve, reject); tx.onerror = () => reject(tx.error); })); }
  async put(event: UsageEvent): Promise<void> { await this.operation<void>("readwrite", (s, resolve, reject) => { const r = s.put(event); r.onsuccess = () => resolve(undefined); r.onerror = () => reject(r.error); }); }
  async putMany(events: readonly UsageEvent[]): Promise<void> { for (const event of events) await this.put(event); }
  async get(id: string): Promise<UsageEvent | undefined> { return this.operation("readonly", (s, resolve, reject) => { const r = s.get(id); r.onsuccess = () => resolve(r.result as UsageEvent | undefined); r.onerror = () => reject(r.error); }); }
  async getAll(): Promise<UsageEvent[]> { return sortEvents(await this.operation("readonly", (s, resolve, reject) => { const r = s.getAll(); r.onsuccess = () => resolve(r.result as UsageEvent[]); r.onerror = () => reject(r.error); })); }
  async delete(id: string): Promise<void> { await this.operation<void>("readwrite", (s, resolve, reject) => { const r = s.delete(id); r.onsuccess = () => resolve(undefined); r.onerror = () => reject(r.error); }); }
  async clear(): Promise<void> { await this.operation<void>("readwrite", (s, resolve, reject) => { const r = s.clear(); r.onsuccess = () => resolve(undefined); r.onerror = () => reject(r.error); }); }
  async query(range: { start?: string; end?: string } = {}): Promise<UsageEvent[]> { return (await this.getAll()).filter((e) => (!range.start || e.occurredAt >= range.start) && (!range.end || e.occurredAt < range.end)); }
}

export function createClientUsageEventRepository(options: { databaseName?: string; storeName?: string; storageKey?: string } = {}): UsageEventRepository {
  if (typeof indexedDB !== "undefined") return new IndexedDbUsageEventRepository(options.databaseName, options.storeName);
  return new LocalStorageUsageEventRepository(options.storageKey);
}
