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
}

export const noopEvents: ProjectEvents = { publish: () => Promise.resolve() };
