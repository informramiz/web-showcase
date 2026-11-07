import { describe, expect, it } from "vitest";
import { AppError } from "@/core/errors";
import { clientIp, toActionState } from "@/server/action-state";

describe("action helpers", () => {
  it("trusts only cf-connecting-ip for the client address", () => {
    expect(clientIp(new Headers({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "6.6.6.6" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6" }))).toBeUndefined();
  });

  it("maps domain errors to form state and rethrows anything else", () => {
    expect(toActionState(new AppError("validation", "Bad", { name: ["Required"] }))).toEqual({
      error: "Bad",
      fields: { name: ["Required"] },
    });
    expect(() => toActionState(new Error("boom"))).toThrow("boom");
  });
});
