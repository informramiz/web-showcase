import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";
import { openSqlite } from "@/db/sqlite";
import { createFsStorage } from "@/features/attachments/data/fs-storage";
import { createR2Storage, type R2BucketLike } from "@/features/attachments/data/r2-storage";
import { createContainer, type Container } from "./container";

type D1Client = Parameters<typeof drizzle>[0];

// One container per server process (per isolate on Workers), so the in-memory rate limiters live as
// long as the process does. Tests swap it with setContainer().
const g = globalThis as unknown as { __teamboard?: Container };

/** Set in wrangler.jsonc. Local dev, tests and E2E use a SQLite file instead. */
const onCloudflare = () => process.env.DB_DRIVER === "d1";

function cloudflareContainer(): Container {
  const { env } = getCloudflareContext();
  return createContainer(drizzle(env.DB as D1Client, { schema }), {
    storage: createR2Storage(env.ATTACHMENTS as R2BucketLike),
  });
}

function localContainer(): Container {
  return createContainer(openSqlite(process.env.DATABASE_PATH ?? "./data/teamboard.db"), {
    storage: createFsStorage(process.env.UPLOADS_DIR ?? "./data/uploads"),
  });
}

export function getContainer(): Container {
  g.__teamboard ??= onCloudflare() ? cloudflareContainer() : localContainer();
  return g.__teamboard;
}

export function setContainer(container: Container | undefined): void {
  g.__teamboard = container;
}
