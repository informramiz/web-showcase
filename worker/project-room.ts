import { DurableObject } from "cloudflare:workers";
import type { ProjectEvent } from "../src/features/realtime/domain/types";

/**
 * One instance per project (addressed by project id). Holds that project's browser sockets using the WebSocket
 * Hibernation API, so an idle room costs nothing: developers.cloudflare.com/durable-objects/best-practices/websockets/
 */
export class ProjectRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Answered by the runtime without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  /** The Worker has already verified the ticket; this only upgrades the connection. */
  override fetch(): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** RPC from the Next.js app whenever activity is recorded in this project. */
  broadcast(event: ProjectEvent): void {
    const message = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message);
      } catch {
        // A socket closing mid-send is not an error for the others.
      }
    }
  }

  /** Clients only listen; anything other than the auto-answered ping is ignored. */
  override webSocketMessage(): void {}

  override webSocketClose(ws: WebSocket, code: number, reason: string): void {
    ws.close(code, reason);
  }
}
