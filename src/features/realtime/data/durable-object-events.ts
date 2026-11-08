import type { ProjectEvent, ProjectEvents } from "../domain/types";

/** The slice of the ProjectRoom Durable Object namespace binding used here (RPC on the stub). */
export interface ProjectRoomNamespace {
  getByName(name: string): { broadcast(event: ProjectEvent): Promise<void>; revoke(userId: string): Promise<void> };
}

/** One Durable Object per project holds that project's sockets; publishing is an RPC call to it. */
export function createDurableObjectEvents(rooms: ProjectRoomNamespace): ProjectEvents {
  return {
    publish: (projectId, event) => rooms.getByName(projectId).broadcast(event),
    revoke: (projectId, userId) => rooms.getByName(projectId).revoke(userId),
  };
}
