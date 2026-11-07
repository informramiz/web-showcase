export interface RateLimiter {
  /** Records one attempt for `key`; returns false once the key is over its limit for the current window. */
  hit(key: string): boolean;
  /** Clears the count for `key`, e.g. after a successful login. */
  reset(key: string): void;
}

/**
 * Fixed-window, in-memory limiter. Good enough for one Node process. On Cloudflare each isolate keeps its own
 * counts, so a production deploy would swap this for the Workers Rate Limiting binding or a Durable Object.
 *
 * Memory is bounded by `maxKeys`: when full, the oldest window is evicted (a Map iterates in insertion order,
 * and a key is re-inserted whenever its window restarts), so each hit is O(1) with no full scans.
 */
export function createMemoryRateLimiter(
  limit: number,
  windowMs: number,
  now: () => number = Date.now,
  maxKeys = 10_000,
): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    hit(key) {
      const t = now();
      const w = windows.get(key);
      if (w && t - w.start < windowMs) {
        w.count++;
        return w.count <= limit;
      }
      windows.delete(key);
      if (windows.size >= maxKeys) {
        const oldest = windows.keys().next().value;
        if (oldest !== undefined) windows.delete(oldest);
      }
      windows.set(key, { start: t, count: 1 });
      return true;
    },
    reset(key) {
      windows.delete(key);
    },
  };
}
