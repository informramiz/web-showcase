import type { ProjectEvent, ProjectEventSubscriber, ProjectEvents } from "../domain/types";

/**
 * Single-process pub/sub for local dev and E2E (`next dev` / `next start`). It cannot span Worker isolates,
 * which is why Cloudflare uses a Durable Object per project instead.
 */
export function createMemoryEventBus(): ProjectEvents & ProjectEventSubscriber {
  const listeners = new Map<string, Set<(e: ProjectEvent) => void>>();
  return {
    publish(projectId, event) {
      for (const listener of listeners.get(projectId) ?? []) listener(event);
      return Promise.resolve();
    },
    // Local dev only; SSE re-authorizes on every reconnect, so revocation is not modelled here.
    revoke: () => Promise.resolve(),
    subscribe(projectId, listener) {
      const set = listeners.get(projectId) ?? new Set();
      set.add(listener);
      listeners.set(projectId, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(projectId);
      };
    },
  };
}
