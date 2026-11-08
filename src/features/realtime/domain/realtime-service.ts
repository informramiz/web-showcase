import { AppError } from "@/core/errors";
import type { User } from "@/features/auth/domain/types";
import type { ProjectService } from "@/features/projects/domain/project-service";
import { signTicket, TICKET_TTL_MS } from "./ticket";
import type { ProjectEvent, RealtimeConnection, RealtimeTransport, Unsubscribe } from "./types";

export const POLL_INTERVAL_MS = 10_000;

export interface RealtimeDeps {
  projectService: Pick<ProjectService, "authorize">;
  transport: RealtimeTransport;
  now?: () => number;
  newId?: () => string;
}

/** Decides how a project member connects for live updates. Membership is checked here for every transport. */
export class RealtimeService {
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(private readonly deps: RealtimeDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  async connection(actor: User, projectId: string): Promise<RealtimeConnection> {
    // Taken before the membership check: a revocation racing this request then has a cutoff >= iat.
    const now = this.now();
    await this.deps.projectService.authorize(actor, projectId, "project.view");
    const { transport } = this.deps;
    const path = encodeURIComponent(projectId);
    switch (transport.kind) {
      case "websocket": {
        const ticket = await signTicket(
          { projectId, userId: actor.id, jti: this.newId(), iat: now, exp: now + TICKET_TTL_MS },
          transport.secret,
        );
        return { transport: "websocket", url: `/realtime/${path}?ticket=${encodeURIComponent(ticket)}` };
      }
      case "sse":
        return { transport: "sse", url: `/api/projects/${path}/events` };
      case "poll":
        return { transport: "poll", intervalMs: POLL_INTERVAL_MS };
    }
  }

  /** Local SSE only: subscribe this process to a project's events. */
  async subscribe(actor: User, projectId: string, listener: (e: ProjectEvent) => void): Promise<Unsubscribe> {
    await this.deps.projectService.authorize(actor, projectId, "project.view");
    if (this.deps.transport.kind !== "sse") throw new AppError("not_found", "Event stream not available here");
    return this.deps.transport.bus.subscribe(projectId, listener);
  }
}
