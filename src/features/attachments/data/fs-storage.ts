import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { AttachmentStorage } from "../domain/types";

/** Local dev and E2E adapter: one file per object under `root`. Keys are service-generated "<project>/<uuid>". */
export function createFsStorage(root: string): AttachmentStorage {
  const base = resolve(root);
  const pathFor = (key: string): string => {
    const path = resolve(join(base, key));
    // Defence in depth: keys never come from users, but never let one escape the root either.
    if (!path.startsWith(base + sep)) throw new Error(`Invalid storage key: ${key}`);
    return path;
  };
  return {
    async put(key, data) {
      const path = pathFor(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, new Uint8Array(data));
    },
    async get(key) {
      try {
        return new Blob([await readFile(pathFor(key))]).stream();
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    },
    async delete(key) {
      await rm(pathFor(key), { force: true });
    },
  };
}
