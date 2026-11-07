import { AppError } from "@/core/errors";
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
  now?: () => Date;
  newId?: () => string;
}

export interface SignedIn {
  user: User;
  token: string;
  expiresAt: Date;
}

export class AuthService {
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(private readonly deps: AuthDeps) {
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  async register(input: unknown): Promise<SignedIn> {
    const data = parseInput(registerSchema, input);
    if (await this.deps.users.findByEmail(data.email)) {
      throw new AppError("conflict", "An account with this email already exists", {
        email: ["An account with this email already exists"],
      });
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

  async login(input: unknown): Promise<SignedIn> {
    const data = parseInput(loginSchema, input);
    const user = await this.deps.users.findByEmail(data.email);
    // Same message for unknown email and wrong password, so accounts can't be enumerated.
    if (!user || !(await this.deps.hasher.verify(data.password, user.passwordHash))) {
      throw new AppError("unauthorized", "Email or password is incorrect");
    }
    return this.startSession(toUser(user));
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
