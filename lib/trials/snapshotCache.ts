export type SnapshotCacheMode = "live" | "fresh_cache" | "stale_cache";

export interface SnapshotRead<T> {
  value: T;
  mode: SnapshotCacheMode;
  loadedAt: string;
}

interface StoredSnapshot<T> {
  value: T;
  loadedAtMs: number;
  freshUntilMs: number;
  staleUntilMs: number;
}

export class StaleWhileRevalidateSnapshot<T> {
  private current?: StoredSnapshot<T>;
  private pending?: Promise<StoredSnapshot<T>>;
  private readonly options: {
    load: () => Promise<T>;
    freshForMs: number;
    maxAgeMs: number;
    now?: () => number;
  };

  constructor(options: {
    load: () => Promise<T>;
    freshForMs: number;
    maxAgeMs: number;
    now?: () => number;
  }) {
    if (!Number.isFinite(options.freshForMs) || options.freshForMs < 0) throw new Error("freshForMs must be non-negative");
    if (!Number.isFinite(options.maxAgeMs) || options.maxAgeMs <= options.freshForMs) throw new Error("maxAgeMs must be greater than freshForMs");
    this.options = options;
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private refresh(): Promise<StoredSnapshot<T>> {
    this.pending ??= this.options.load().then((value) => {
      const loadedAtMs = this.now();
      const snapshot = {
        value,
        loadedAtMs,
        freshUntilMs: loadedAtMs + this.options.freshForMs,
        staleUntilMs: loadedAtMs + this.options.maxAgeMs,
      };
      this.current = snapshot;
      return snapshot;
    }).finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private result(snapshot: StoredSnapshot<T>, mode: SnapshotCacheMode): SnapshotRead<T> {
    return { value: snapshot.value, mode, loadedAt: new Date(snapshot.loadedAtMs).toISOString() };
  }

  async read(): Promise<SnapshotRead<T>> {
    const now = this.now();
    if (this.current && now < this.current.freshUntilMs) return this.result(this.current, "fresh_cache");
    if (this.current && now < this.current.staleUntilMs) {
      const stale = this.current;
      void this.refresh().catch(() => undefined);
      return this.result(stale, "stale_cache");
    }
    const refreshed = await this.refresh();
    return this.result(refreshed, "live");
  }
}
