export interface RateLimiter {
  /** Records one attempt for `key`; returns false once the key is over its limit for the current window. */
  hit(key: string): boolean;
  /** Clears the count for `key`, e.g. after a successful login. */
  reset(key: string): void;
}

/**
 * Fixed-window, in-memory limiter. Good enough for one Node process. On Cloudflare each isolate keeps its own
 * counts, so a production deploy would swap this for the Workers Rate Limiting binding or a Durable Object.
 */
export function createMemoryRateLimiter(limit: number, windowMs: number, now: () => number = Date.now): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    hit(key) {
      const t = now();
      const w = windows.get(key);
      if (!w || t - w.start >= windowMs) {
        // Drop stale keys now and then so the map can't grow without bound.
        if (windows.size > 10_000) for (const [k, v] of windows) if (t - v.start >= windowMs) windows.delete(k);
        windows.set(key, { start: t, count: 1 });
        return true;
      }
      w.count++;
      return w.count <= limit;
    },
    reset(key) {
      windows.delete(key);
    },
  };
}
