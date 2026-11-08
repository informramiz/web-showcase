/**
 * A change notification for everyone looking at a project. It carries no data, only what changed, so clients
 * refetch through the normal authorized API instead of trusting pushed payloads.
 */
export interface ProjectEvent {
  action: string;
  taskId: string | null;
  actorId: string;
  at: string;
}

/** Outbound port: fan an event out to the project's open connections (Durable Object on Workers, SSE locally). */
export interface ProjectEvents {
  publish(projectId: string, event: ProjectEvent): Promise<void>;
  /** Drops a user's open live connections to a project (removed from it, or signed out). */
  revoke(projectId: string, userId: string): Promise<void>;
}

export const noopEvents: ProjectEvents = { publish: () => Promise.resolve(), revoke: () => Promise.resolve() };

export type Unsubscribe = () => void;

/** Inbound side of an in-process bus: only the local SSE transport can subscribe directly. */
export interface ProjectEventSubscriber {
  subscribe(projectId: string, listener: (event: ProjectEvent) => void): Unsubscribe;
}

/** How this deployment delivers events, chosen in the composition root. */
export type RealtimeTransport =
  { kind: "websocket"; secret: string } | { kind: "sse"; bus: ProjectEventSubscriber } | { kind: "poll" };

/** What the browser needs to connect. Returned by GET /api/projects/:id/realtime. */
export type RealtimeConnection =
  | { transport: "websocket"; url: string }
  | { transport: "sse"; url: string }
  | { transport: "poll"; intervalMs: number };
