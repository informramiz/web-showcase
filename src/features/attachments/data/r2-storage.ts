import type { AttachmentStorage } from "../domain/types";

/**
 * The slice of the R2 bucket binding this adapter uses, typed locally so the app doesn't need
 * @cloudflare/workers-types in its Node globals. API: developers.cloudflare.com/r2/api/workers/workers-api-reference/
 */
export interface R2BucketLike {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream<Uint8Array> } | null>;
  delete(key: string): Promise<void>;
}

export function createR2Storage(bucket: R2BucketLike): AttachmentStorage {
  return {
    async put(key, data, contentType) {
      await bucket.put(key, data, { httpMetadata: { contentType } });
    },
    async get(key) {
      const object = await bucket.get(key);
      return object?.body ?? null;
    },
    delete: (key) => bucket.delete(key),
  };
}
