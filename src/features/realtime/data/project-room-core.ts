import { TICKET_TTL_MS, type TicketClaims } from "../domain/ticket";
import type { ProjectEvent } from "../domain/types";

/** What the room needs from a socket. Matches the Workers WebSocket. */
export interface RoomSocket {
  send(message: string): void;
  close(code?: number, reason?: string): void;
}

/** The slice of DurableObjectState the room uses, so its logic runs in plain unit tests. */
export interface RoomState<S extends RoomSocket> {
  getWebSockets(tag?: string): S[];
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
    list<T>(options: { prefix: string }): Promise<Map<string, T>>;
    delete(keys: string[]): Promise<number>;
  };
}

const USED_PREFIX = "ticket:";
const REVOKED_PREFIX = "revoked:";
/**
 * Tickets are stamped by the Next.js isolate and the cutoff by the Durable Object, on different clocks. Tickets
 * issued up to this long after a revocation are still refused, so modest clock skew can't let an old one in.
 */
export const REVOCATION_SKEW_MS = 5_000;
/** Application close code (4000-4999) telling the client its access was withdrawn. */
export const REVOKED_CLOSE_CODE = 4001;

/**
 * Durable Object logic, kept free of the `cloudflare:workers` runtime. Admission is single-use per ticket id and
 * refuses tickets issued at or before the user's last revocation. Sockets are tagged with the user id so a
 * user's sockets can be found and closed on revocation.
 */
export class ProjectRoomCore<S extends RoomSocket> {
  constructor(private readonly state: RoomState<S>) {}

  /**
   * True the first time an unrevoked ticket is presented; false on reuse or if it was issued at or before the
   * user's last revocation. Stale entries are pruned as it goes.
   */
  async admit(claims: Pick<TicketClaims, "userId" | "jti" | "iat" | "exp">, now: number): Promise<boolean> {
    const key = USED_PREFIX + claims.jti;
    if (await this.state.storage.get(key)) return false;
    const cutoff = await this.state.storage.get<number>(REVOKED_PREFIX + claims.userId);
    if (cutoff !== undefined && claims.iat <= cutoff + REVOCATION_SKEW_MS) return false;
    await this.prune(now);
    await this.state.storage.put(key, claims.exp);
    return true;
  }

  /** Tags for acceptWebSocket. */
  tagsFor(userId: string): string[] {
    return [userId];
  }

  broadcast(event: ProjectEvent): void {
    const message = JSON.stringify(event);
    for (const socket of this.state.getWebSockets()) {
      try {
        socket.send(message);
      } catch {
        // A socket closing mid-send is not an error for the others.
      }
    }
  }

  /**
   * Closes the user's open sockets and records a cutoff so tickets issued before now can't open new ones.
   * The cutoff is kept for a ticket lifetime: any older ticket has expired by then anyway.
   */
  async revoke(userId: string, now: number): Promise<number> {
    await this.state.storage.put(REVOKED_PREFIX + userId, now);
    const sockets = this.state.getWebSockets(userId);
    for (const socket of sockets) {
      try {
        socket.close(REVOKED_CLOSE_CODE, "Access revoked");
      } catch {
        // Already closed.
      }
    }
    return sockets.length;
  }

  private async prune(now: number): Promise<void> {
    const used = await this.state.storage.list<number>({ prefix: USED_PREFIX });
    const revoked = await this.state.storage.list<number>({ prefix: REVOKED_PREFIX });
    const stale = [
      ...[...used].filter(([, exp]) => exp <= now),
      ...[...revoked].filter(([, cutoff]) => cutoff + REVOCATION_SKEW_MS + TICKET_TTL_MS <= now),
    ].map(([k]) => k);
    if (stale.length) await this.state.storage.delete(stale);
  }
}
