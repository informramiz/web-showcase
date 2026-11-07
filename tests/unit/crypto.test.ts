import { describe, expect, it } from "vitest";
import { createPbkdf2Hasher, generateToken, sha256Hex, timingSafeEqual } from "@/features/auth/domain/crypto";

describe("pbkdf2 hasher", () => {
  const hasher = createPbkdf2Hasher(1000);

  it("verifies the right password and rejects a wrong one", async () => {
    const stored = await hasher.hash("correct horse");
    expect(stored).toMatch(/^pbkdf2\$1000\$[^$]+\$[^$]+$/);
    expect(await hasher.verify("correct horse", stored)).toBe(true);
    expect(await hasher.verify("wrong horse", stored)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hasher.hash("same")).not.toBe(await hasher.hash("same"));
  });

  it("rejects malformed stored values", async () => {
    expect(await hasher.verify("x", "bcrypt$10$abc")).toBe(false);
    expect(await hasher.verify("x", "pbkdf2$1000")).toBe(false);
  });
});

describe("tokens", () => {
  it("generates url-safe, unique tokens", () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(a);
  });

  it("hashes with sha256", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("compares byte arrays", () => {
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
  });
});
