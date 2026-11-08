import { describe, expect, it } from "vitest";
import { toFtsQuery } from "@/features/tasks/data/fts-query";

describe("toFtsQuery", () => {
  it("quotes each word as a prefix phrase", () => {
    expect(toFtsQuery("fix  login")).toBe('"fix"* "login"*');
  });

  it("neutralises FTS5 syntax and quotes", () => {
    expect(toFtsQuery('title:"x" OR NEAR(')).toBe('"title x"* "OR"* "NEAR"*');
  });

  it("keeps non-ASCII letters", () => {
    expect(toFtsQuery("café")).toBe('"café"*');
  });

  it("returns null when nothing is searchable", () => {
    expect(toFtsQuery(" %% -- ")).toBeNull();
  });
});
