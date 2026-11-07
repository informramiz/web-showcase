import type { PasswordHasher } from "./types";

// Web Crypto only, so the same code runs on Node and on Cloudflare Workers (no native bcrypt).
// Workers cap PBKDF2 at 100k iterations.
const ITERATIONS = 100_000;
const KEY_BITS = 256;
const enc = new TextEncoder();

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** Compares in time independent of where the first difference is. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export function createPbkdf2Hasher(iterations = ITERATIONS): PasswordHasher {
  return {
    async hash(password) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const hash = await derive(password, salt, iterations);
      return `pbkdf2$${iterations}$${toB64(salt)}$${toB64(hash)}`;
    },
    async verify(password, stored) {
      const [scheme, iter, salt, hash] = stored.split("$");
      if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
      const actual = await derive(password, fromB64(salt), Number(iter));
      return timingSafeEqual(actual, fromB64(hash));
    },
  };
}

/** 32 random bytes, base64url. */
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
