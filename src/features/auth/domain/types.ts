export interface User {
  id: string;
  email: string;
  name: string;
}

export interface UserRecord extends User {
  passwordHash: string;
  createdAt: Date;
}

export interface SessionRecord {
  /** SHA-256 hex of the session token. */
  id: string;
  userId: string;
  expiresAt: Date;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  findManyByIds(ids: string[]): Promise<User[]>;
  insert(user: UserRecord): Promise<void>;
}

export interface SessionRepository {
  insert(session: SessionRecord): Promise<void>;
  findById(id: string): Promise<SessionRecord | null>;
  updateExpiry(id: string, expiresAt: Date): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, stored: string): Promise<boolean>;
}

export const toUser = ({ id, email, name }: User): User => ({ id, email, name });
