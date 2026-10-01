/**
 * Coalesces individual key lookups into batched requests.
 *
 * Calls to `load(key)` made within `windowMs` of each other are grouped and
 * resolved by a single `fetchBatch(keys)` call (split into chunks of at most
 * `maxBatchSize`). Concurrent loads of the same key share one promise.
 */
export interface KeyedBatcherOptions<K, V> {
  windowMs: number;
  maxBatchSize: number;
  /** Must resolve a value (or the `missing` value) for every requested key. */
  fetchBatch: (keys: K[]) => Promise<Map<K, V>>;
  /** Value used for keys absent from the batch result. */
  missing: V;
}

interface Waiter<V> {
  resolve: (v: V) => void;
  reject: (e: unknown) => void;
}

export class KeyedBatcher<K, V> {
  private queue = new Map<K, Waiter<V>[]>();
  private inflight = new Map<K, Promise<V>>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly opts: KeyedBatcherOptions<K, V>;
  requestCount = 0;

  constructor(opts: KeyedBatcherOptions<K, V>) {
    this.opts = opts;
  }

  load(key: K): Promise<V> {
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const promise = new Promise<V>((resolve, reject) => {
      const waiters = this.queue.get(key) ?? [];
      waiters.push({ resolve, reject });
      this.queue.set(key, waiters);
    });
    this.inflight.set(key, promise);
    // Avoid holding failed keys forever: drop from inflight once settled.
    promise.then(
      () => this.inflight.delete(key),
      () => this.inflight.delete(key)
    );
    this.schedule();
    return promise;
  }

  loadMany(keys: K[]): Promise<V[]> {
    return Promise.all(keys.map((k) => this.load(k)));
  }

  private schedule() {
    if (this.timer) return;
    if (this.queue.size >= this.opts.maxBatchSize) {
      // Full batch ready: dispatch on next tick instead of waiting.
      this.timer = setTimeout(() => this.dispatch(), 0);
      return;
    }
    this.timer = setTimeout(() => this.dispatch(), this.opts.windowMs);
  }

  private dispatch() {
    this.timer = null;
    const entries = Array.from(this.queue.entries());
    this.queue.clear();
    for (let i = 0; i < entries.length; i += this.opts.maxBatchSize) {
      const chunk = entries.slice(i, i + this.opts.maxBatchSize);
      void this.runChunk(chunk);
    }
  }

  private async runChunk(chunk: Array<[K, Waiter<V>[]]>) {
    const keys = chunk.map(([k]) => k);
    try {
      this.requestCount++;
      const result = await this.opts.fetchBatch(keys);
      for (const [key, waiters] of chunk) {
        const value = result.has(key) ? (result.get(key) as V) : this.opts.missing;
        waiters.forEach((w) => w.resolve(value));
      }
    } catch (error) {
      for (const [, waiters] of chunk) waiters.forEach((w) => w.reject(error));
    }
  }

  get pending(): number {
    return this.inflight.size;
  }
}
