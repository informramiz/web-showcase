import { describe, expect, it } from "vitest";
import { createMemoryRateLimiter } from "@/core/rate-limit";
import { AuthService, REGISTER_FAILED } from "@/features/auth/domain/auth-service";
import { SESSION_TTL_MS } from "@/features/auth/domain/session-policy";
import type { PasswordHasher } from "@/features/auth/domain/types";
import type { SessionRecord, SessionRepository, UserRecord, UserRepository } from "@/features/auth/domain/types";
import { plainHasher } from "../helpers/setup";

/** In-memory fakes: the service is tested on its own, without a database. */
function fakes() {
  const users = new Map<string, UserRecord>();
  const sessions = new Map<string, SessionRecord>();
  const userRepo: UserRepository = {
    findByEmail: (email) => Promise.resolve([...users.values()].find((u) => u.email === email) ?? null),
    findById: (id) => Promise.resolve(users.get(id) ?? null),
    findManyByIds: (ids) => Promise.resolve(ids.flatMap((id) => (users.has(id) ? [users.get(id)!] : []))),
    insert: (u) => Promise.resolve(void users.set(u.id, u)),
  };
  const sessionRepo: SessionRepository = {
    insert: (s) => Promise.resolve(void sessions.set(s.id, s)),
    findById: (id) => Promise.resolve(sessions.get(id) ?? null),
    updateExpiry: (id, expiresAt) => Promise.resolve(void sessions.set(id, { ...sessions.get(id)!, expiresAt })),
    delete: (id) => Promise.resolve(void sessions.delete(id)),
  };
  return { users, sessions, userRepo, sessionRepo };
}

function service(now: { t: number }, hasher: PasswordHasher = plainHasher, ipLimit = 100, failLimit = 100) {
  const f = fakes();
  let n = 0;
  const auth = new AuthService({
    users: f.userRepo,
    sessions: f.sessionRepo,
    hasher,
    ipLimiter: createMemoryRateLimiter(ipLimit, 60_000, () => now.t),
    failureLimiter: createMemoryRateLimiter(failLimit, 60_000, () => now.t),
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
      hash: (p) => plainHasher.hash(p),
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

  it("blocks an email after repeated failures, even with the right password, until the window ends", async () => {
    const clock = { t: 0 };
    const { auth } = service(clock, plainHasher, 100, 2);
    await auth.register(input);
    const bad = { email: input.email, password: "nope" };
    // Failures come from different IPs: the per-email limit spans all of them.
    await expect(auth.login(bad, { ip: "4.0.0.1" })).rejects.toMatchObject({ kind: "unauthorized" });
    await expect(auth.login(bad, { ip: "4.0.0.2" })).rejects.toMatchObject({ kind: "unauthorized" });
    const good = { email: input.email, password: input.password };
    await expect(auth.login(bad, { ip: "4.0.0.3" })).rejects.toMatchObject({ kind: "rate_limited" });
    await expect(auth.login(good, { ip: "5.0.0.1" })).rejects.toMatchObject({ kind: "rate_limited" });
    // Keys use the normalised email, so case and spaces don't get around it.
    await expect(auth.login({ ...good, email: "  DANA@Test.dev " })).rejects.toMatchObject({ kind: "rate_limited" });
    clock.t = 60_000;
    await expect(auth.login(good)).resolves.toMatchObject({ user: { email: input.email } });
  });

  it("counts only failures per email, and a success clears them", async () => {
    const { auth } = service({ t: 0 }, plainHasher, 100, 2);
    await auth.register(input);
    const good = { email: input.email, password: input.password };
    const bad = { email: input.email, password: "nope" };
    for (let i = 0; i < 3; i++) await auth.login(good);
    await expect(auth.login(bad)).rejects.toMatchObject({ kind: "unauthorized" });
    await auth.login(good);
    await expect(auth.login(bad)).rejects.toMatchObject({ kind: "unauthorized" });
    await expect(auth.login(bad)).rejects.toMatchObject({ kind: "unauthorized" });
    await expect(auth.login(bad)).rejects.toMatchObject({ kind: "rate_limited" });
  });

  it("starts a demo session without a password, even when that email is failure-limited", async () => {
    const { auth, users } = service({ t: 0 }, plainHasher, 100, 2);
    await auth.register({ name: "Demo", email: "demo@test.dev", password: "password1" });
    const bad = { email: "demo@test.dev", password: "nope" };
    // Drive the per-email failure limiter over its cap: a normal login is now locked out.
    for (let i = 0; i < 3; i++) await expect(auth.login(bad)).rejects.toBeDefined();
    await expect(auth.login(bad)).rejects.toMatchObject({ kind: "rate_limited" });
    // The demo path bypasses the password and the failure limiter, so it still signs in.
    const res = await auth.startDemoSession("demo@test.dev");
    expect(res.user.email).toBe("demo@test.dev");
    expect(users.size).toBe(1);
  });

  it("refuses a demo session when the demo account is not seeded", async () => {
    const { auth } = service({ t: 0 });
    await expect(auth.startDemoSession("missing@test.dev")).rejects.toMatchObject({ kind: "unauthorized" });
  });

  it("applies the per-IP limiter to demo sessions", async () => {
    const { auth } = service({ t: 0 }, plainHasher, 1, 100);
    await auth.register({ name: "Demo", email: "demo@test.dev", password: "password1" });
    await auth.startDemoSession("demo@test.dev", { ip: "7.7.7.7" });
    await expect(auth.startDemoSession("demo@test.dev", { ip: "7.7.7.7" })).rejects.toMatchObject({
      kind: "rate_limited",
    });
  });

  it("caps all attempts per IP, and a blocked request creates no per-email keys", async () => {
    const failures = createMemoryRateLimiter(100, 60_000, () => 0);
    const f = fakes();
    const auth = new AuthService({
      users: f.userRepo,
      sessions: f.sessionRepo,
      hasher: plainHasher,
      ipLimiter: createMemoryRateLimiter(2, 60_000, () => 0),
      failureLimiter: failures,
    });
    const ip = { ip: "9.9.9.9" };
    await expect(auth.login({ email: "a@test.dev", password: "x" }, ip)).rejects.toMatchObject({
      kind: "unauthorized",
    });
    await expect(auth.login({ email: "b@test.dev", password: "x" }, ip)).rejects.toMatchObject({
      kind: "unauthorized",
    });
    await expect(auth.login({ email: "c@test.dev", password: "x" }, ip)).rejects.toMatchObject({
      kind: "rate_limited",
    });
    // The blocked attempt for c never reached the failure counter.
    for (let i = 0; i < 99; i++) failures.hit("login:email:c@test.dev");
    expect(failures.isLimited("login:email:c@test.dev")).toBe(false);
    // Another IP is unaffected.
    await expect(auth.login({ email: "c@test.dev", password: "x" }, { ip: "8.8.8.8" })).rejects.toMatchObject({
      kind: "unauthorized",
    });
  });

  it("blocks a failed login that can't be counted because the failure store is full", async () => {
    const f = fakes();
    const failures = createMemoryRateLimiter(100, 60_000, () => 0, 1);
    failures.hit("login:email:someone@test.dev"); // fills the store with a live window
    const auth = new AuthService({
      users: f.userRepo,
      sessions: f.sessionRepo,
      hasher: plainHasher,
      failureLimiter: failures,
    });
    await expect(auth.login({ email: "dana@test.dev", password: "x" })).rejects.toMatchObject({ kind: "rate_limited" });
  });

  it("refuses even a correct password when the failure store is full", async () => {
    const f = fakes();
    const failures = createMemoryRateLimiter(100, 60_000, () => 0, 1);
    const auth = new AuthService({
      users: f.userRepo,
      sessions: f.sessionRepo,
      hasher: plainHasher,
      failureLimiter: failures,
    });
    await auth.register(input);
    failures.hit("login:email:someone@test.dev");
    await expect(auth.login({ email: input.email, password: input.password })).rejects.toMatchObject({
      kind: "rate_limited",
    });
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
