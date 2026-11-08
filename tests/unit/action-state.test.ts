import { describe, expect, it } from "vitest";
import { AppError } from "@/core/errors";
import { toActionState } from "@/server/action-state";

describe("toActionState", () => {
  it("maps domain errors to form state and rethrows anything else", () => {
    expect(toActionState(new AppError("validation", "Bad", { name: ["Required"] }))).toEqual({
      error: "Bad",
      fields: { name: ["Required"] },
    });
    expect(() => toActionState(new Error("boom"))).toThrow("boom");
  });
});
