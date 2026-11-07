export interface RateLimiter {
  /** Records one attempt for `key`; returns false if the key is over its limit (or the limiter is full). */
  hit(key: string): boolean;
  /** True while `key` has used up its window, without recording an attempt. */
  isLimited(key: string): boolean;
  /** True if a hit on `key` would be recorded: it has a live window, or there is (or can be made) room for one. */
  canTrack(key: string): boolean;
  /** Clears the count for `key`. */
  reset(key: string): void;
}

/**
 * Fixed-window, in-memory limiter. Good enough for one Node process. On Cloudflare each isolate keeps its own
 * counts, so a production deploy would swap this for the Workers Rate Limiting binding or a Durable Object.
 *
 * Memory is bounded by `maxKeys`. A live window is never evicted. A Map iterates in insertion order and a key
 * is re-inserted whenever its window restarts, so expired windows sit at the front: when full, those are dropped
 * first (cost proportional to what is dropped, no full scan). If it is still full, new keys fail closed.
 */
export function createMemoryRateLimiter(
  limit: number,
  windowMs: number,
  now: () => number = Date.now,
  maxKeys = 10_000,
): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  const live = (w: { start: number } | undefined, t: number): w is { start: number; count: number } =>
    w !== undefined && t - w.start < windowMs;

  return {
    hit(key) {
      const t = now();
      const w = windows.get(key);
      if (live(w, t)) {
        w.count++;
        return w.count <= limit;
      }
      windows.delete(key);
      for (const [k, v] of windows) {
        if (windows.size < maxKeys || live(v, t)) break;
        windows.delete(k);
      }
      if (windows.size >= maxKeys) return false;
      windows.set(key, { start: t, count: 1 });
      return true;
    },
    isLimited(key) {
      const w = windows.get(key);
      return live(w, now()) && w.count >= limit;
    },
    canTrack(key) {
      const t = now();
      if (live(windows.get(key), t) || windows.size < maxKeys) return true;
      // Expired windows sit at the front, so the oldest one tells us whether hit() could make room.
      const oldest = windows.values().next().value;
      return oldest !== undefined && !live(oldest, t);
    },
    reset(key) {
      windows.delete(key);
    },
  };
}
