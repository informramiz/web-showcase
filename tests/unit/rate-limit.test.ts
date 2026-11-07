import { describe, expect, it } from "vitest";
import { createMemoryRateLimiter } from "@/core/rate-limit";

describe("memory rate limiter", () => {
  it("allows up to the limit per window, then resets", () => {
    const clock = { t: 0 };
    const rl = createMemoryRateLimiter(2, 1000, () => clock.t);
    expect(rl.isLimited("k")).toBe(false);
    expect([rl.hit("k"), rl.hit("k")]).toEqual([true, true]);
    expect(rl.isLimited("k")).toBe(true);
    expect(rl.hit("k")).toBe(false);
    expect(rl.hit("other")).toBe(true);
    clock.t = 1000;
    expect(rl.isLimited("k")).toBe(false);
    expect(rl.hit("k")).toBe(true);
    rl.hit("k");
    rl.reset("k");
    expect(rl.hit("k")).toBe(true);
  });

  it("never evicts a live window; fails closed for new keys when full", () => {
    const rl = createMemoryRateLimiter(1, 60_000, () => 0, 2);
    rl.hit("a");
    rl.hit("b");
    expect(rl.hit("c")).toBe(false); // full of live windows: reject
    expect(rl.hit("a")).toBe(false); // a is still tracked and over its limit
    expect(rl.isLimited("c")).toBe(false);
  });

  it("drops expired windows first when full", () => {
    const clock = { t: 0 };
    const rl = createMemoryRateLimiter(1, 10, () => clock.t, 2);
    rl.hit("a");
    clock.t = 5;
    rl.hit("b");
    clock.t = 12; // a expired, b still live
    expect(rl.hit("c")).toBe(true); // a dropped to make room
    expect(rl.hit("b")).toBe(false); // b kept its count
    expect(rl.hit("d")).toBe(false); // b and c are live: full
  });
});
