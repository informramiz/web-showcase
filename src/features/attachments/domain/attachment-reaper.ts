import type { AttachmentReaper, AttachmentRepository, AttachmentStorage } from "./types";

const nothing = () => Promise.resolve();

/**
 * Removes file objects after their parent task or project is deleted. An orphaned object costs storage, not
 * correctness, so a failed removal is logged rather than surfaced (the same policy as deleting one attachment).
 */
export function createAttachmentReaper(
  attachments: Pick<AttachmentRepository, "storageKeysForTask" | "storageKeysForProject">,
  storage: AttachmentStorage | null,
): AttachmentReaper {
  const remover = (keys: string[]) => async () => {
    for (const key of keys) {
      try {
        await storage?.delete(key);
      } catch (e) {
        console.error("attachment cleanup failed", key, e);
      }
    }
  };
  return {
    async forTask(projectId, taskId) {
      return storage ? remover(await attachments.storageKeysForTask(projectId, taskId)) : nothing;
    },
    async forProject(projectId) {
      return storage ? remover(await attachments.storageKeysForProject(projectId)) : nothing;
    },
  };
}
