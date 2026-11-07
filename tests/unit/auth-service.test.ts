import { describe, expect, it } from "vitest";
import { createMemoryRateLimiter } from "@/core/rate-limit";
import { AuthService, REGISTER_FAILED, SESSION_TTL_MS } from "@/features/auth/domain/auth-service";
import type { PasswordHasher } from "@/features/auth/domain/types";
import type { SessionRecord, SessionRepository, UserRecord, UserRepository } from "@/features/auth/domain/types";
import { plainHasher } from "../helpers/setup";

/** In-memory fakes: the service is tested on its own, without a database. */
function fakes() {
  const users = new Map<string, UserRecord>();
  const sessions = new Map<string, SessionRecord>();
  const userRepo: UserRepository = {
    findByEmail: async (email) => [...users.values()].find((u) => u.email === email) ?? null,
    findById: async (id) => users.get(id) ?? null,
    findManyByIds: async (ids) => ids.flatMap((id) => (users.has(id) ? [users.get(id)!] : [])),
    insert: async (u) => void users.set(u.id, u),
  };
  const sessionRepo: SessionRepository = {
    insert: async (s) => void sessions.set(s.id, s),
    findById: async (id) => sessions.get(id) ?? null,
    updateExpiry: async (id, expiresAt) => void sessions.set(id, { ...sessions.get(id)!, expiresAt }),
    delete: async (id) => void sessions.delete(id),
  };
  return { users, sessions, userRepo, sessionRepo };
}

function service(now: { t: number }, hasher: PasswordHasher = plainHasher, limit = 100) {
  const f = fakes();
  let n = 0;
  const auth = new AuthService({
    users: f.userRepo,
    sessions: f.sessionRepo,
    hasher,
    limiter: createMemoryRateLimiter(limit, 60_000, () => now.t),
    now: () => new Date(now.t),
    newId: () => `u${++n}`,
  });
  return { auth, ...f };
}

const input = { name: "Dana", email: "dana@test.dev", password: "password1" };

describe("AuthService", () => {
  it("registers, hashes the password and starts a session", async () => {
    const clock = { t: 1_000 };
    const { auth, users, sessions } = service(clock);
    const res = await auth.register(input);
    expect(res.user).toEqual({ id: "u1", email: "dana@test.dev", name: "Dana" });
    expect(users.get("u1")?.passwordHash).toBe("plain$password1");
    expect(res.expiresAt.getTime()).toBe(1_000 + SESSION_TTL_MS);
    // The stored id is a hash, never the raw token.
    expect(sessions.has(res.token)).toBe(false);
    expect(sessions.size).toBe(1);
  });

  it("rejects a duplicate email with a neutral message", async () => {
    const { auth } = service({ t: 0 });
    await auth.register(input);
    await expect(auth.register({ ...input, email: "DANA@test.dev" })).rejects.toMatchObject({
      kind: "validation",
      message: REGISTER_FAILED,
    });
  });

  it("runs exactly one password verify whether or not the email exists", async () => {
    const verified: string[] = [];
    const spy: PasswordHasher = {
      hash: plainHasher.hash,
      verify: async (p, stored) => {
        verified.push(stored);
        return plainHasher.verify(p, stored);
      },
    };
    const { auth } = service({ t: 0 }, spy);
    await auth.register(input);
    await expect(auth.login({ email: "who@test.dev", password: "x" })).rejects.toMatchObject({ kind: "unauthorized" });
    await expect(auth.login({ email: input.email, password: "x" })).rejects.toMatchObject({ kind: "unauthorized" });
    // Unknown email is checked against the dummy hash, known email against the real one.
    expect(verified).toEqual(["plain$teamboard-dummy-password", "plain$password1"]);
  });

  it("rate limits login per email and per IP, and resets the email on success", async () => {
    const clock = { t: 0 };
    const { auth } = service(clock, plainHasher, 2);
    await auth.register(input, { ip: "1.1.1.1" });
    const bad = { email: input.email, password: "nope" };
    await expect(auth.login(bad)).rejects.toMatchObject({ kind: "unauthorized" });
    await expect(auth.login(bad)).rejects.toMatchObject({ kind: "unauthorized" });
    await expect(auth.login(bad)).rejects.toMatchObject({ kind: "rate_limited" });
    clock.t = 60_000;
    await auth.login({ email: input.email, password: input.password });
    await expect(auth.login(bad)).rejects.toMatchObject({ kind: "unauthorized" });

    // Different emails from one IP are still capped by the IP key.
    const ip = { ip: "9.9.9.9" };
    await expect(auth.login({ email: "a@test.dev", password: "x" }, ip)).rejects.toMatchObject({ kind: "unauthorized" });
    await expect(auth.login({ email: "b@test.dev", password: "x" }, ip)).rejects.toMatchObject({ kind: "unauthorized" });
    await expect(auth.login({ email: "c@test.dev", password: "x" }, ip)).rejects.toMatchObject({ kind: "rate_limited" });
  });

  it("rate limits registration per IP", async () => {
    const { auth } = service({ t: 0 }, plainHasher, 1);
    await auth.register(input, { ip: "2.2.2.2" });
    await expect(auth.register({ ...input, email: "x@test.dev" }, { ip: "2.2.2.2" })).rejects.toMatchObject({
      kind: "rate_limited",
    });
  });

  it("logs in with the right password, with one message for every failure", async () => {
    const { auth } = service({ t: 0 });
    await auth.register(input);
    const ok = await auth.login({ email: input.email, password: input.password });
    expect(ok.user.id).toBe("u1");
    const wrong = auth.login({ email: input.email, password: "nope" });
    const unknown = auth.login({ email: "who@test.dev", password: "nope" });
    await expect(wrong).rejects.toMatchObject({ kind: "unauthorized", message: "Email or password is incorrect" });
    await expect(unknown).rejects.toMatchObject({ kind: "unauthorized", message: "Email or password is incorrect" });
  });

  it("validates tokens and logs out", async () => {
    const { auth } = service({ t: 0 });
    const { token } = await auth.register(input);
    expect(await auth.validate(token)).toMatchObject({ id: "u1" });
    expect(await auth.validate(undefined)).toBeNull();
    expect(await auth.validate("forged")).toBeNull();
    await auth.logout(token);
    expect(await auth.validate(token)).toBeNull();
    await auth.logout(undefined);
  });

  it("expires sessions and renews them past half-life", async () => {
    const clock = { t: 0 };
    const { auth, sessions } = service(clock);
    const { token } = await auth.register(input);
    const [id] = [...sessions.keys()];

    clock.t = SESSION_TTL_MS * 0.6;
    expect(await auth.validate(token)).not.toBeNull();
    expect(sessions.get(id!)?.expiresAt.getTime()).toBe(clock.t + SESSION_TTL_MS);

    clock.t += SESSION_TTL_MS + 1;
    expect(await auth.validate(token)).toBeNull();
    expect(sessions.size).toBe(0);
  });

  it("returns null when the session's user is gone", async () => {
    const { auth, users } = service({ t: 0 });
    const { token } = await auth.register(input);
    users.clear();
    expect(await auth.validate(token)).toBeNull();
  });
});
