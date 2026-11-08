import type { AttachmentStorage } from "../domain/types";

/** Test double and default when no storage is configured. Bytes live as long as the process. */
export function createMemoryStorage(): AttachmentStorage & { keys(): string[] } {
  const objects = new Map<string, ArrayBuffer>();
  return {
    put(key, data) {
      objects.set(key, data.slice(0));
      return Promise.resolve();
    },
    get(key) {
      const bytes = objects.get(key);
      return Promise.resolve(bytes ? new Blob([bytes]).stream() : null);
    },
    delete(key) {
      objects.delete(key);
      return Promise.resolve();
    },
    keys: () => [...objects.keys()],
  };
}
