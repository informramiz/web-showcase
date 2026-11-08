import { AppError } from "@/core/errors";
import { createMemoryRateLimiter, type RateLimiter } from "@/core/rate-limit";
import { parseInput } from "@/core/validation";
import { generateToken, sha256Hex } from "./crypto";
import { loginSchema, registerSchema } from "./schemas";
import { RENEW_BELOW_MS, SESSION_TTL_MS } from "./session-policy";
import { toUser, type PasswordHasher, type SessionRepository, type User, type UserRepository } from "./types";

export interface AuthDeps {
  users: UserRepository;
  sessions: SessionRepository;
  hasher: PasswordHasher;
  /** All auth attempts per client IP. Defaults to 20 per 15 minutes. */
  ipLimiter?: RateLimiter;
  /** Failed logins per email, across all IPs. Defaults to 10 per 15 minutes. */
  failureLimiter?: RateLimiter;
  now?: () => Date;
  newId?: () => string;
  /** Runs after a session ends, e.g. to close the user's realtime sockets. */
  onLogout?: (userId: string) => Promise<void>;
}

/** Who is asking; used only for rate limiting. */
export interface ClientInfo {
  ip?: string;
}

export const REGISTER_FAILED = "Could not create an account with these details. If you already have one, sign in.";

const tooMany = () => new AppError("rate_limited", "Too many attempts. Try again in a few minutes.");

export interface SignedIn {
  user: User;
  token: string;
  expiresAt: Date;
}

export class AuthService {
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly ipLimiter: RateLimiter;
  private readonly failureLimiter: RateLimiter;
  /** Computed up front so the first unknown-email login costs the same as the rest. */
  private readonly dummyHash: Promise<string>;

  constructor(private readonly deps: AuthDeps) {
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    this.ipLimiter = deps.ipLimiter ?? createMemoryRateLimiter(20, 15 * 60 * 1000);
    this.failureLimiter = deps.failureLimiter ?? createMemoryRateLimiter(10, 15 * 60 * 1000);
    this.dummyHash = deps.hasher.hash("teamboard-dummy-password");
  }

  async register(input: unknown, client: ClientInfo = {}): Promise<SignedIn> {
    const data = parseInput(registerSchema, input);
    this.throttleIp(client);
    if (await this.deps.users.findByEmail(data.email)) {
      // Neutral wording: does not confirm that the email is registered.
      throw new AppError("validation", REGISTER_FAILED, { email: [REGISTER_FAILED] });
    }
    const user = {
      id: this.newId(),
      email: data.email,
      name: data.name,
      passwordHash: await this.deps.hasher.hash(data.password),
      createdAt: this.now(),
    };
    await this.deps.users.insert(user);
    return this.startSession(toUser(user));
  }

  async login(input: unknown, client: ClientInfo = {}): Promise<SignedIn> {
    // The schema trims and lowercases the email, so every key below uses the normalised form.
    const data = parseInput(loginSchema, input);
    this.throttleIp(client);
    const emailKey = `login:email:${data.email}`;
    // While an email is over its failure limit, every attempt gets the same answer, right password or not.
    // A production build would pair this with an email unlock link or a CAPTCHA.
    // Also refuse when a failure couldn't be counted (store full), so a saturated limiter never fails open.
    if (this.failureLimiter.isLimited(emailKey) || !this.failureLimiter.canTrack(emailKey)) throw tooMany();
    const user = await this.deps.users.findByEmail(data.email);
    // Always run one verify, against a dummy hash when the email is unknown, so response time
    // doesn't reveal whether an account exists. Same message for both failures, too.
    const stored = user?.passwordHash ?? (await this.dummyHash);
    const ok = await this.deps.hasher.verify(data.password, stored);
    if (!user || !ok) {
      // false means over the limit or the store is full; either way the failure can't be counted, so block.
      if (!this.failureLimiter.hit(emailKey)) throw tooMany();
      throw new AppError("unauthorized", "Email or password is incorrect");
    }
    this.failureLimiter.reset(emailKey);
    return this.startSession(toUser(user));
  }

  /** Checked first, so a blocked request creates no other limiter keys. No IP (local dev) means no IP limit. */
  private throttleIp(client: ClientInfo): void {
    if (client.ip && !this.ipLimiter.hit(`ip:${client.ip}`)) throw tooMany();
  }

  /** Returns the user for a session token, or null if missing, unknown or expired. */
  async validate(token: string | undefined): Promise<User | null> {
    if (!token) return null;
    const id = await sha256Hex(token);
    const session = await this.deps.sessions.findById(id);
    if (!session) return null;
    const now = this.now();
    if (session.expiresAt.getTime() <= now.getTime()) {
      await this.deps.sessions.delete(id);
      return null;
    }
    if (session.expiresAt.getTime() - now.getTime() < RENEW_BELOW_MS) {
      await this.deps.sessions.updateExpiry(id, new Date(now.getTime() + SESSION_TTL_MS));
    }
    const user = await this.deps.users.findById(session.userId);
    return user ? toUser(user) : null;
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    const id = await sha256Hex(token);
    const session = await this.deps.sessions.findById(id);
    await this.deps.sessions.delete(id);
    if (session) await this.deps.onLogout?.(session.userId);
  }

  private async startSession(user: User): Promise<SignedIn> {
    const token = generateToken();
    const expiresAt = new Date(this.now().getTime() + SESSION_TTL_MS);
    await this.deps.sessions.insert({ id: await sha256Hex(token), userId: user.id, expiresAt });
    return { user, token, expiresAt };
  }
}
