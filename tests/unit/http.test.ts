import { describe, expect, it } from "vitest";
import { clientIp, isCrossSite, readBodyLimited } from "@/server/http";

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

describe("readBodyLimited", () => {
  const post = (body: BodyInit | null, length?: string) => {
    const headers = new Headers();
    if (length !== undefined) headers.set("content-length", length);
    return new Request("http://localhost/x", { method: "POST", body, headers });
  };
  const stream = (chunks: number[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const n of chunks) c.enqueue(new Uint8Array(n));
        c.close();
      },
    });

  it("returns the body when it fits", async () => {
    expect((await readBodyLimited(post("hello", "5"), 10)).byteLength).toBe(5);
  });

  it("requires a valid positive Content-Length", async () => {
    for (const length of [undefined, "", "NaN", "-1", "0", "2e3", "Infinity"]) {
      await expect(readBodyLimited(post("x", length), 10)).rejects.toMatchObject({ kind: "length_required" });
    }
  });

  it("rejects a declared length over the limit and a body that lies about its length", async () => {
    await expect(readBodyLimited(post("x", "11"), 10)).rejects.toMatchObject({ kind: "too_large" });
    const lying = new Request("http://localhost/x", {
      method: "POST",
      body: stream([6, 6]),
      headers: { "content-length": "4" },
      duplex: "half",
    } as RequestInit);
    await expect(readBodyLimited(lying, 10)).rejects.toMatchObject({ kind: "too_large" });
  });

  it("rejects an empty body", async () => {
    await expect(readBodyLimited(post(null, "3"), 10)).rejects.toMatchObject({ kind: "validation" });
  });
});
