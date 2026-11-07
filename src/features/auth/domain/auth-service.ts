import { AppError } from "@/core/errors";
import { createMemoryRateLimiter, type RateLimiter } from "@/core/rate-limit";
import { parseInput } from "@/core/validation";
import { generateToken, sha256Hex } from "./crypto";
import { loginSchema, registerSchema } from "./schemas";
import { toUser, type PasswordHasher, type SessionRepository, type User, type UserRepository } from "./types";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Extend a session when less than half its lifetime is left. */
const RENEW_BELOW_MS = SESSION_TTL_MS / 2;

export interface AuthDeps {
  users: UserRepository;
  sessions: SessionRepository;
  hasher: PasswordHasher;
  /** Limits attempts per client IP and per email. Defaults to 10 per 15 minutes each. */
  limiter?: RateLimiter;
  now?: () => Date;
  newId?: () => string;
}

/** Who is asking; used only for rate limiting. */
export interface ClientInfo {
  ip?: string;
}

export const REGISTER_FAILED = "Could not create an account with these details. If you already have one, sign in.";

export interface SignedIn {
  user: User;
  token: string;
  expiresAt: Date;
}

export class AuthService {
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly limiter: RateLimiter;
  /** Computed up front so the first unknown-email login costs the same as the rest. */
  private readonly dummyHash: Promise<string>;

  constructor(private readonly deps: AuthDeps) {
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    this.limiter = deps.limiter ?? createMemoryRateLimiter(10, 15 * 60 * 1000);
    this.dummyHash = deps.hasher.hash("teamboard-dummy-password");
  }

  async register(input: unknown, client: ClientInfo = {}): Promise<SignedIn> {
    const data = parseInput(registerSchema, input);
    this.throttle("register", data.email, client);
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
    const data = parseInput(loginSchema, input);
    this.throttle("login", data.email, client);
    const user = await this.deps.users.findByEmail(data.email);
    // Always run one verify, against a dummy hash when the email is unknown, so response time
    // doesn't reveal whether an account exists. Same message for both failures, too.
    const stored = user?.passwordHash ?? (await this.dummyHash);
    const ok = await this.deps.hasher.verify(data.password, stored);
    if (!user || !ok) throw new AppError("unauthorized", "Email or password is incorrect");
    // A successful login clears the per-email counter, so the owner isn't locked out by earlier typos.
    this.limiter.reset(`login:email:${data.email}`);
    return this.startSession(toUser(user));
  }

  private throttle(action: string, email: string, client: ClientInfo): void {
    // Hit both keys (no short-circuit) so each counter advances on every attempt.
    const byEmail = this.limiter.hit(`${action}:email:${email}`);
    const byIp = client.ip ? this.limiter.hit(`${action}:ip:${client.ip}`) : true;
    if (!byEmail || !byIp) throw new AppError("rate_limited", "Too many attempts. Try again in a few minutes.");
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
    if (token) await this.deps.sessions.delete(await sha256Hex(token));
  }

  private async startSession(user: User): Promise<SignedIn> {
    const token = generateToken();
    const expiresAt = new Date(this.now().getTime() + SESSION_TTL_MS);
    await this.deps.sessions.insert({ id: await sha256Hex(token), userId: user.id, expiresAt });
    return { user, token, expiresAt };
  }
}
