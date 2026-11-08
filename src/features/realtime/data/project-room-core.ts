import type { TicketClaims } from "../domain/ticket";
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
/** Application close code (4000-4999) telling the client its access was withdrawn. */
export const REVOKED_CLOSE_CODE = 4001;

/**
 * Durable Object logic, kept free of the `cloudflare:workers` runtime. Admission is single-use per ticket id;
 * sockets are tagged with the user id so a user's sockets can be found and closed on revocation.
 */
export class ProjectRoomCore<S extends RoomSocket> {
  constructor(private readonly state: RoomState<S>) {}

  /** True the first time a ticket is presented; false on reuse. Expired entries are pruned as it goes. */
  async admit(claims: Pick<TicketClaims, "jti" | "exp">, now: number): Promise<boolean> {
    const key = USED_PREFIX + claims.jti;
    if (await this.state.storage.get(key)) return false;
    const used = await this.state.storage.list<number>({ prefix: USED_PREFIX });
    const expired = [...used].filter(([, exp]) => exp <= now).map(([k]) => k);
    if (expired.length) await this.state.storage.delete(expired);
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

  revoke(userId: string): number {
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
}
