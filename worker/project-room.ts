import { DurableObject } from "cloudflare:workers";
import { ProjectRoomCore } from "../src/features/realtime/data/project-room-core";
import type { ProjectEvent } from "../src/features/realtime/domain/types";

/** Headers the Worker sets after verifying the ticket. The Durable Object is not reachable from outside. */
export const TICKET_HEADERS = {
  userId: "x-ticket-user",
  jti: "x-ticket-id",
  iat: "x-ticket-iat",
  exp: "x-ticket-exp",
} as const;

/**
 * One instance per project (addressed by project id). Holds that project's browser sockets using the WebSocket
 * Hibernation API, so an idle room costs nothing: developers.cloudflare.com/durable-objects/best-practices/websockets/
 */
export class ProjectRoom extends DurableObject<Env> {
  private readonly room: ProjectRoomCore<WebSocket>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.room = new ProjectRoomCore(ctx);
    // Answered by the runtime without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  /** The Worker has verified the ticket's signature; this enforces single use and revocation, then upgrades. */
  override async fetch(request: Request): Promise<Response> {
    const userId = request.headers.get(TICKET_HEADERS.userId);
    const jti = request.headers.get(TICKET_HEADERS.jti);
    const iat = Number(request.headers.get(TICKET_HEADERS.iat));
    const exp = Number(request.headers.get(TICKET_HEADERS.exp));
    if (!userId || !jti || !Number.isFinite(iat) || !Number.isFinite(exp)) {
      return new Response("Bad request", { status: 400 });
    }
    if (!(await this.room.admit({ userId, jti, iat, exp }, Date.now()))) {
      return new Response("Ticket used or revoked", { status: 401 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server, this.room.tagsFor(userId));
    return new Response(null, { status: 101, webSocket: client });
  }

  /** RPC from the Next.js app whenever activity is recorded in this project. */
  broadcast(event: ProjectEvent): void {
    this.room.broadcast(event);
  }

  /** RPC: close a user's sockets and void their outstanding tickets after they leave the project or sign out. */
  async revoke(userId: string): Promise<void> {
    await this.room.revoke(userId, Date.now());
  }

  /** Clients only listen; anything other than the auto-answered ping is ignored. */
  override webSocketMessage(): void {}

  override webSocketClose(ws: WebSocket, code: number, reason: string): void {
    ws.close(code, reason);
  }
}
