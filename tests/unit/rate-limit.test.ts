import { describe, expect, it } from "vitest";
import { createMemoryRateLimiter } from "@/core/rate-limit";

describe("memory rate limiter", () => {
  it("allows up to the limit per window, then resets", () => {
    const clock = { t: 0 };
    const rl = createMemoryRateLimiter(2, 1000, () => clock.t);
    expect([rl.hit("k"), rl.hit("k"), rl.hit("k")]).toEqual([true, true, false]);
    expect(rl.hit("other")).toBe(true);
    clock.t = 1000;
    expect(rl.hit("k")).toBe(true);
    rl.hit("k");
    rl.reset("k");
    expect(rl.hit("k")).toBe(true);
  });

  it("evicts the oldest key once the hard cap is reached", () => {
    const rl = createMemoryRateLimiter(1, 60_000, () => 0, 3);
    rl.hit("a");
    rl.hit("b");
    rl.hit("c");
    expect(rl.hit("b")).toBe(false); // b is still tracked
    rl.hit("d"); // map full: evicts a, the oldest
    expect(rl.hit("a")).toBe(true); // a starts fresh; this evicts b
    expect(rl.hit("c")).toBe(false);
    expect(rl.hit("b")).toBe(true);
  });

  it("moves a key to the back when its window restarts", () => {
    const clock = { t: 0 };
    const rl = createMemoryRateLimiter(1, 10, () => clock.t, 2);
    rl.hit("a");
    rl.hit("b");
    clock.t = 10;
    rl.hit("a"); // new window for a, now newest
    rl.hit("c"); // evicts b, not a
    expect(rl.hit("a")).toBe(false);
    expect(rl.hit("b")).toBe(true);
  });
});
