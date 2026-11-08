import { describe, expect, it } from "vitest";
import { clientIp, isCrossSite } from "@/server/http";

const req = (method: string, headers: Record<string, string>) =>
  new Request("http://teamboard.test/api/x", { method, headers });

describe("http helpers", () => {
  it("trusts only cf-connecting-ip for the client address", () => {
    expect(clientIp(new Headers({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "6.6.6.6" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6" }))).toBeUndefined();
  });

  it("flags mutations whose Origin does not match the host", () => {
    const host = { host: "teamboard.test" };
    expect(isCrossSite(req("POST", { ...host, origin: "https://evil.example" }))).toBe(true);
    expect(isCrossSite(req("DELETE", { ...host, origin: "not a url" }))).toBe(true);
    expect(isCrossSite(req("PATCH", { ...host, origin: "https://teamboard.test" }))).toBe(false);
    expect(isCrossSite(req("POST", { "x-forwarded-host": "teamboard.test", origin: "https://teamboard.test" }))).toBe(
      false,
    );
  });

  it("ignores safe methods and requests without an Origin", () => {
    expect(isCrossSite(req("GET", { host: "teamboard.test", origin: "https://evil.example" }))).toBe(false);
    expect(isCrossSite(req("POST", { host: "teamboard.test" }))).toBe(false);
  });
});
