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

  it("evicts stale keys when the map is large", () => {
    const clock = { t: 0 };
    const rl = createMemoryRateLimiter(1, 10, () => clock.t);
    for (let i = 0; i <= 10_001; i++) rl.hit(`k${i}`);
    clock.t = 20;
    expect(rl.hit("k0")).toBe(true);
    expect(rl.hit("fresh")).toBe(true);
  });
});
